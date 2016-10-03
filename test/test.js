let AWS = require("aws-sdk-mock")
let expect = require("chai").expect


// Setup environment

process.env.SQS_URL = "https://sqs.us-east-1.amazonaws.com/123abc/456def"
process.env.ECS_CLUSTER = "ECS_CLUSTER"
process.env.ECS_TASK = "federalist-builder:4"
process.env.MAX_TASKS = 2
process.env.PORT = 3000


// Variables to verify that AWS methods are invoked
let sqsReceiveMessageInvocations = 0
let sqsDeleteMessageInvocations = 0
let ecsDescribeClustersInvocations = 0
let ecsRunTaskInvocations = 0

// Mock SQS behavior

let messageCount = 0

AWS.mock("SQS", "receiveMessage", (params, callback) => {
  sqsReceiveMessageInvocations++

  expect(params.QueueUrl).to.eq(process.env.SQS_URL)

  let data = {
    Messages: [
      {
        Body: JSON.stringify({
          messageNumber: messageCount++,
        }),
        ReceiptHandle: "mocked-receipt-handle",
      },
    ],
  }
  callback(null, data)
})

AWS.mock("SQS", "deleteMessage", (params, callback) => {
  sqsDeleteMessageInvocations++

  expect(params.ReceiptHandle).to.equal("mocked-receipt-handle")
  callback(null)
})



// Mock ECS Behavior

let availableNodeCount = process.env.MAX_TASKS

AWS.mock("ECS", "describeClusters", (params, callback) => {
  ecsDescribeClustersInvocations++

  expect(params.clusters).to.deep.equal([process.env.ECS_CLUSTER])

  let data = {
    clusters: [
      {
        runningTasksCount: process.env.MAX_TASKS - availableNodeCount--,
        pendingTasksCount: 0,
      }
    ]
  }
  callback(null, data)
})

AWS.mock("ECS", "runTask", (params, callback) => {
  ecsRunTaskInvocations++

  expect(params.taskDefinition).to.equal(process.env.ECS_TASK)
  expect(params.cluster).to.equal(process.env.ECS_CLUSTER)

  let containerOverrides = params.overrides.containerOverrides[0]
  expect(containerOverrides.messageNumber).to.be.at.least(0)

  let data = {
    tasks: [{}],
  }
  callback(null, data)
})

// Integration test

describe("app", () => {
  it("should take messages from the SQS queue and add builds to the ECS queue", (done) => {
    setTimeout(() => {
      console.log(`SQS.receiveMessage: ${sqsReceiveMessageInvocations}`)
      console.log(`SQS.deleteMessage: ${sqsDeleteMessageInvocations}`)
      console.log(`ESC.describeClusters: ${ecsDescribeClustersInvocations}`)
      console.log(`ECS.runTask: ${ecsRunTaskInvocations}`)

      expect(sqsReceiveMessageInvocations).to.be.above(0)
      expect(sqsDeleteMessageInvocations).to.be.equal(2)
      expect(ecsDescribeClustersInvocations).to.be.above(0)
      expect(ecsRunTaskInvocations).to.equal(2)

      done()
    }, 1000)
    require("../app.js")
  })
})
