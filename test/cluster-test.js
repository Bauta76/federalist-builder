const expect = require('chai').expect

const nock = require("nock")
const Cluster = require("../src/cluster")

const mockListAppsRequest = require("./nocks/cloud-foundry-list-apps-nock")
const mockRestageAppRequest = require("./nocks/cloud-foundry-restage-app-nock")
const mockTokenRequest = require("./nocks/cloud-foundry-oauth-token-nock")
const mockUpdateAppRequest = require("./nocks/cloud-foundry-update-app-nock")

describe("Cluster", () => {
  afterEach(() => nock.cleanAll())

  describe(".countAvailableContainers()", () => {
    it("should return the number of available containers", done => {
      mockTokenRequest()
      mockListAppsRequest(Array(10).fill({}))

      const cluster = new Cluster()
      cluster.start()

      setTimeout(() => {
        expect(cluster.countAvailableContainers()).to.eq(10)
        done()
      }, 50)
    })
  })

  describe(".startBuild(build)", () => {
    it("should update and restage a container", done => {
      mockTokenRequest()
      mockListAppsRequest([{}])

      const mockedUpdateRequest = mockUpdateAppRequest()
      const mockedRestageRequest = mockRestageAppRequest()

      const cluster = new Cluster()
      cluster.start()

      setTimeout(() => {
        cluster.startBuild({
          buildID: "123abc",
          containerEnvironment: {},
        })
        setTimeout(() => {
          expect(mockedUpdateRequest.isDone()).to.eq(true)
          expect(mockedRestageRequest.isDone()).to.eq(true)
          done()
        }, 50)
      }, 50)
    })

    it("should reduce the number of available containers by 1", done => {
      mockTokenRequest()
      mockListAppsRequest([{}])
      mockUpdateAppRequest()
      mockRestageAppRequest()

      const cluster = new Cluster()
      cluster.start()

      setTimeout(() => {
        expect(cluster.countAvailableContainers()).to.eq(1)
        cluster.startBuild({
          buildID: "123abc",
          containerEnvironment: {},
        })
        setTimeout(() => {
          expect(cluster.countAvailableContainers()).to.eq(0)
          done()
        }, 50)
      }, 50)
    })

    it("should not reduce the number of containers by 1 if it fails to start the build", done => {
      mockTokenRequest()
      mockListAppsRequest([{ guid: "fake-container" }])
      mockUpdateAppRequest()

      nock("https://api.example.com").post(
        "/v2/apps/fake-container/restage"
      ).reply(500)

      const cluster = new Cluster()
      mockServer(cluster)
      cluster.start()

      setTimeout(() => {
        expect(cluster.countAvailableContainers()).to.eq(1)
        cluster.startBuild({
          buildID: "123abc",
          containerEnvironment: {},
        })
        setTimeout(() => {
          expect(cluster.countAvailableContainers()).to.eq(1)
          done()
        }, 50)
      }, 50)
    })
  })

  describe(".stopBuild(buildID)", () => {
    it("should make the build for the given buildID available", () => {
      const cluster = new Cluster()
      cluster._containers = [
        {
          guid: "123abc",
          build: {
            buildID: "456def",
          },
        },
        {
          guid: "789ghi",
          build: undefined
        },
      ]

      cluster.stopBuild("456def")

      container = cluster._containers.find(container => container.guid === "123abc")

      expect(container).to.be.a("object")
      expect(container.build).to.be.undefined
    })
  })
})
