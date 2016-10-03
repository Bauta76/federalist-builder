// If settings present, start New Relic
if (process.env.NEW_RELIC_APP_NAME && process.env.NEW_RELIC_LICENSE_KEY) {
  console.log('Activating New Relic: ', process.env.NEW_RELIC_APP_NAME);
  require('newrelic');
}

// ENV Vars
var queueUrl = process.env.SQS_URL,
    clusterName = process.env.ECS_CLUSTER,
    taskDefinition = process.env.ECS_TASK,
    maxTasks = process.env.MAX_TASKS,
    port = process.env.PORT;

// Librarys
var AWS = require('aws-sdk'),
    http = require('http'),
    cfenv = require('cfenv'),
    appEnv = cfenv.getAppEnv(),
    awsCreds = appEnv.getServiceCreds('federalist-aws-user');

// If running in Cloud Foundry, use AWS credentials from a service
if (awsCreds) {
  AWS.config.update({
    accessKeyId: awsCreds.access_key,
    secretAccessKey: awsCreds.secret_key,
    region: 'us-east-1'
  });
}

// AWS services
var sqs = new AWS.SQS(),
    ecs = new AWS.ECS();

// Listen on PORT (CloudFoundry pings this to make sure the script is running)
http.createServer(function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(port || 8000);

// Start watching the queue
let startTime = new Date()
checkQueue();

// Check SQS queue
function checkQueue() {
  var params = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20
      };
  sqs.receiveMessage(params, function(err, data) {
    if (err) error(err);
    if (data && data.Messages && data.Messages[0]) {
      checkCapacity(data.Messages[0]);
    }
    // Quit after a second if we're running tests
    if (new Date() - startTime < 1000 || typeof global.it !== 'function') {
      checkQueue();
    }
  });
}

// On message, check ECS task capacity and length
function checkCapacity(message) {
  var params = {
        clusters: [ clusterName ]
      };
  ecs.describeClusters(params, function(err, data) {
    if (err) return error(err);
    var cluster = data.clusters[0],
        tasks;

    if (cluster) {
      tasks = cluster.runningTasksCount + cluster.pendingTasksCount;
      if (tasks < maxTasks) runTask(message);
    }

  });
}

// Run task and delete message once it's initialized
function runTask(message) {
  var body = JSON.parse(message.Body),
      params = {
        taskDefinition: taskDefinition,
        cluster: clusterName,
        overrides: { containerOverrides: [ body ] }
      };

  ecs.runTask(params, function(err, data) {
    if (err) return error(err);
    var params = {
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle
        };
    if (data.tasks.length) {
      sqs.deleteMessage(params, function(err, data) {
        if (err) return error(err);
      });
    }
  });
}

// Handle errors
function error(err) {
  console.error(new Error(err));
}
