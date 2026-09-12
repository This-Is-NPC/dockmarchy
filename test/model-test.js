// Tests for the list parser. Model.js and I18n.js do not depend on Qt, so
// the whole engine runs here: `node test/model-test.js`.

const assert = require("assert")
const M = require("../Model.js")
const I = require("../I18n.js")

const dockerRunning = {
  ID: "abc1e4985a70",
  Names: "ib_local_ai_backend",
  Image: "ib-local-ai_backend:4.2.1",
  State: "running",
  Status: "Up 14 hours (healthy)",
  HealthStatus: "healthy",
  Ports: "8100/tcp",
  Labels: "com.docker.compose.config-hash=7e42dce88f6c107b0585f77275f855c9bea932c4b5aa35588204f85ba9676374,com.docker.compose.container-number=1,com.docker.compose.depends_on=ai_backend_schema_migrate:service_completed_successfully:false,llama-server-api:service_started:false,document_extractor:service_healthy:false,pgsql_db:service_healthy:false,com.docker.compose.image=sha256:bbcfc22d14b028b93ed577107f51cf3458708713f764d3d3d094a5b2276c36d6,com.docker.compose.oneoff=False,com.docker.compose.project=ib-local-ts,com.docker.compose.service=ai_backend,com.docker.compose.version=5.4.0"
}

const dockerExited = {
  ID: "4a623b67c820",
  Names: "ib_local_schema_migrate",
  Image: "ib-local-admin:4.2.1",
  State: "exited",
  Status: "Exited (0) 16 hours ago",
  HealthStatus: "none",
  Ports: "",
  Labels: "com.docker.compose.depends_on=pgsql_db:service_healthy:false,com.docker.compose.project=ib-local-ts,com.docker.compose.service=schema_migrate"
}

const dockerUnhealthy = {
  ID: "deadbeef0001",
  Names: "api",
  Image: "api:latest",
  State: "running",
  Status: "Up 3 minutes (unhealthy)",
  HealthStatus: "unhealthy",
  Ports: "3000/tcp",
  Labels: "com.docker.compose.project=shop,com.docker.compose.service=api"
}

const podmanRunning = {
  Id: "ff11aa22bb33cc44dd55ee66ff77889900112233",
  Names: ["/web"],
  Image: "docker.io/library/nginx:latest",
  State: "running",
  Status: "Up 2 hours",
  Ports: [{ host_port: 8080, container_port: 80, protocol: "tcp" }],
  Labels: { "io.podman.compose.project": "site", "io.podman.compose.service": "web" }
}

// ---- labels: commas inside depends_on must not steal the project name

const labels = M.parseLabelString(dockerRunning.Labels)
assert.strictEqual(labels["com.docker.compose.project"], "ib-local-ts")
assert.strictEqual(labels["com.docker.compose.service"], "ai_backend")
assert.ok(labels["com.docker.compose.depends_on"].indexOf("llama-server-api") >= 0)
assert.strictEqual(M.projectOf(labels), "ib-local-ts")
assert.strictEqual(M.serviceOf(labels), "ai_backend")

// ---- normalize

const running = M.normalize(dockerRunning, "docker")
assert.strictEqual(running.name, "ib_local_ai_backend")
assert.strictEqual(running.containerId, "abc1e4985a70")
assert.strictEqual(running.shortId, "abc1e4985a70")
assert.strictEqual(M.containerKey(running), "docker:abc1e4985a70")
assert.strictEqual(M.containerKey({ engine: "docker", id: "hidden-by-qml" }), "")
assert.strictEqual(running.state, "running")
assert.strictEqual(running.running, true)
assert.strictEqual(running.problem, false)
assert.strictEqual(running.health, "healthy")
assert.strictEqual(running.project, "ib-local-ts")
assert.strictEqual(running.service, "ai_backend")
assert.strictEqual(running.engine, "docker")
assert.strictEqual(running.ports, "8100/tcp")

const exited = M.normalize(dockerExited, "docker")
assert.strictEqual(exited.running, false)
assert.strictEqual(exited.problem, false)
assert.strictEqual(exited.health, "")
assert.strictEqual(exited.service, "schema_migrate")

const sick = M.normalize(dockerUnhealthy, "docker")
assert.strictEqual(sick.problem, true)
assert.strictEqual(sick.running, true)

const pod = M.normalize(podmanRunning, "podman")
assert.strictEqual(pod.name, "web")
assert.strictEqual(pod.engine, "podman")
assert.strictEqual(pod.project, "site")
assert.strictEqual(pod.service, "web")
assert.strictEqual(pod.ports, "8080:80/tcp")

assert.strictEqual(M.normalize({}, "docker"), null)
assert.strictEqual(M.firstName(["/foo", "bar"]), "foo")
assert.strictEqual(M.trimSlash("/nginx"), "nginx")

assert.strictEqual(M.normalizeState("Up 4 hours"), "running")
assert.strictEqual(M.normalizeState("Exited (0) 3 minutes ago"), "exited")
assert.strictEqual(M.normalizeHealth("none"), "")
assert.strictEqual(M.nextAction(running), "stop")
assert.strictEqual(M.nextAction(exited), "start")

// ---- parseList: NDJSON (docker) and a JSON array (podman)

const ndjson = JSON.stringify(dockerRunning) + "\n" + JSON.stringify(dockerExited) + "\n"
const fromDocker = M.parseList(ndjson, "docker")
assert.strictEqual(fromDocker.ok, true)
assert.strictEqual(fromDocker.containers.length, 2)
assert.strictEqual(fromDocker.containers[0].running, true)

const fromPodman = M.parseList(JSON.stringify([podmanRunning]), "podman")
assert.strictEqual(fromPodman.ok, true)
assert.strictEqual(fromPodman.containers[0].name, "web")

assert.strictEqual(M.parseList("", "docker").containers.length, 0)
assert.strictEqual(M.parseList("lixo{", "docker").ok, false)
assert.strictEqual(M.parseList(JSON.stringify(dockerRunning), "docker").containers[0].name, "ib_local_ai_backend")

// ---- merge, summary, filter, group

const merged = M.mergeLists(fromDocker.containers, fromPodman.containers, [sick])
const stats = M.summary(merged)
assert.strictEqual(stats.total, 4)
assert.strictEqual(stats.running, 3)
assert.strictEqual(stats.stopped, 1)
assert.strictEqual(stats.unhealthy, 1)
assert.strictEqual(stats.engine, "both")
assert.strictEqual(M.barLabel(stats), "3")
assert.strictEqual(M.barLabel(null), "—")

assert.strictEqual(M.filterBy(merged, "stopped").length, 1)
assert.strictEqual(M.filterBy(merged, "running").length, 3)
assert.strictEqual(M.filterBy(merged, "problem")[0].name, "api")
assert.strictEqual(M.filterBy(merged, "all").length, 4)
assert.strictEqual(M.searchBy(merged, "nginx").length, 1)
assert.strictEqual(M.searchBy(merged, "IB-LOCAL").length, 2)
assert.strictEqual(M.searchBy(merged, "zzzz").length, 0)
assert.strictEqual(M.searchBy(merged, "  ").length, 4)

const stopJobs = M.bulkJobs(merged, "stop")
assert.strictEqual(stopJobs.length, 2)
assert.strictEqual(stopJobs[0].engine, "docker")
assert.strictEqual(stopJobs[0].ids.length, 2)
assert.strictEqual(stopJobs[1].engine, "podman")
assert.strictEqual(M.bulkJobs(merged, "start").length, 1)
assert.strictEqual(M.bulkJobs(merged, "start")[0].ids.length, 1)
assert.strictEqual(M.logsCap(), 12)
const runningLog = M.logLaunchCommand({ engine: "docker", name: "web", running: true })
assert.ok(runningLog.indexOf("xdg-terminal-exec -- bash -lc") === 0)
assert.ok(runningLog.indexOf("logs -f --tail 200") >= 0)
const stoppedLog = M.logLaunchCommand({ engine: "docker", name: "web", running: false })
assert.ok(stoppedLog.indexOf("logs -f") < 0)
assert.ok(stoppedLog.indexOf("logs --tail 200") >= 0)

const groups = M.groupByProject(merged)
assert.ok(groups.some(g => g.name === "ib-local-ts" && g.total === 2 && g.running === 1))
assert.ok(groups.some(g => g.name === "shop" && g.problem === 1))
assert.ok(groups.some(g => g.name === "site" && g.running === 1))

const lone = M.normalize({
  ID: "abc123",
  Names: "orphan",
  State: "running",
  Status: "Up 1 second",
  Labels: ""
}, "docker")
assert.strictEqual(M.groupByProject([lone])[0].name, "")

// Problems sort first so a sick container is at the top of the panel.
assert.strictEqual(merged[0].name, "api")
assert.strictEqual(running.kind, "container")

// ---- same engine behind both CLIs must not be counted twice
// `docker --version` says "podman ..." on a podman-docker host, and the same
// container/image/volume/network then arrives from both commands.

assert.strictEqual(M.dockerIsPodmanShim("podman version 6.1.1"), true)
assert.strictEqual(M.dockerIsPodmanShim("Emulate Docker CLI using podman."), true)
assert.strictEqual(M.dockerIsPodmanShim("Docker version 28.0.1, build bbd0f7c"), false)
assert.strictEqual(M.dockerIsPodmanShim(""), false)

const thinContainer = M.normalize({
  Id: "ABC1E4985A70",
  Names: ["/ib_local_ai_backend"],
  Image: "ib-local-ai_backend:4.2.1",
  State: "running",
  Labels: ""
}, "docker")
const richContainer = M.normalize({
  Id: "abc1e4985a70",
  Names: ["/ib_local_ai_backend"],
  Image: "ib-local-ai_backend:4.2.1",
  State: "running",
  Status: "Up 2 hours (healthy)",
  Labels: ""
}, "podman")
const oneContainer = M.mergeLists([thinContainer], [richContainer])
assert.strictEqual(oneContainer.length, 1)
assert.strictEqual(oneContainer[0].status, "Up 2 hours (healthy)")
assert.strictEqual(oneContainer[0].engine, "podman")
assert.strictEqual(M.identityKey(thinContainer), M.identityKey(richContainer))
assert.ok(M.itemScore(richContainer) > M.itemScore(thinContainer))

const oneImage = M.mergeLists(
  [M.normalizeImage({ ID: "f4c02a334659", Repository: "nginx", Tag: "latest", Containers: "1" }, "docker")],
  [M.normalizeImage({ Id: "f4c02a334659", Repository: "nginx", Tag: "latest", Containers: "1" }, "podman")]
)
assert.strictEqual(oneImage.length, 1)

const oneNetwork = M.mergeLists(
  [M.normalizeNetwork({ ID: "9bd1c0de341a", Name: "shared", Driver: "bridge" }, "docker")],
  [M.normalizeNetwork({ id: "9bd1c0de341a", name: "shared", driver: "bridge" }, "podman")]
)
assert.strictEqual(oneNetwork.length, 1)

const oneVolume = M.mergeLists(
  [M.normalizeVolume({ Name: "shared_data", Driver: "local" }, "docker")],
  [M.normalizeVolume({ Name: "shared_data", Driver: "local" }, "podman")]
)
assert.strictEqual(oneVolume.length, 1)

// A genuinely separate engine keeps its own rows.
assert.strictEqual(M.mergeLists([running], [pod]).length, 2)

// ---- images, volumes, networks

const dockerImage = {
  Containers: "3",
  CreatedSince: "30 hours ago",
  ID: "f4c02a334659",
  Repository: "ib-local-admin",
  Size: "1.35GB",
  Tag: "4.2.1"
}
const img = M.normalizeImage(dockerImage, "docker")
assert.strictEqual(img.kind, "image")
assert.strictEqual(img.name, "ib-local-admin:4.2.1")
assert.strictEqual(img.used, 3)
assert.strictEqual(img.running, true)
assert.strictEqual(img.removable, true)
assert.ok(img.size > 1e9)
assert.strictEqual(M.resourceKey(img), "image:docker:f4c02a334659")

const dangling = M.normalizeImage({ ID: "deadbeef0001", Repository: "<none>", Tag: "<none>", Size: "12MB", Containers: "0" }, "docker")
assert.strictEqual(dangling.dangling, true)
assert.strictEqual(dangling.running, false)
assert.ok(dangling.name.indexOf("deadbeef") === 0)

const namedVol = M.normalizeVolume({
  Name: "ib-local-ts_akt_runtime",
  Driver: "local",
  Scope: "local",
  Labels: "com.docker.compose.project=ib-local-ts,com.docker.compose.volume=akt_runtime"
}, "docker")
assert.strictEqual(namedVol.kind, "volume")
assert.strictEqual(namedVol.project, "ib-local-ts")
assert.strictEqual(namedVol.anonymous, false)
assert.strictEqual(namedVol.removable, true)

const anonVol = M.normalizeVolume({
  Name: "1c269b13eec2fef2b36f00623349f8de386baa0497569be5cf9bff8b7be4ba22",
  Driver: "local",
  Labels: "com.docker.volume.anonymous="
}, "docker")
assert.strictEqual(anonVol.anonymous, true)
assert.strictEqual(anonVol.running, false)

const userNet = M.normalizeNetwork({
  ID: "9bd1c0de341a",
  Name: "ib_admin_db",
  Driver: "bridge",
  Internal: "false",
  Labels: "com.docker.compose.project=ib-local-ts,com.docker.compose.network=ib_admin_db"
}, "docker")
assert.strictEqual(userNet.kind, "network")
assert.strictEqual(userNet.project, "ib-local-ts")
assert.strictEqual(userNet.removable, true)
assert.strictEqual(userNet.builtin, false)

const bridge = M.normalizeNetwork({ ID: "3d20e05e1366", Name: "bridge", Driver: "bridge", Internal: "false", Labels: "" }, "docker")
assert.strictEqual(bridge.builtin, true)
assert.strictEqual(bridge.removable, false)

const bundle = [
  JSON.stringify(dockerImage),
  "---DOCKMARCHY-VOLUMES---",
  JSON.stringify({ Name: "ib-local-ts_akt_runtime", Driver: "local", Labels: "com.docker.compose.project=ib-local-ts" }),
  "---DOCKMARCHY-NETWORKS---",
  JSON.stringify({ ID: "3d20e05e1366", Name: "bridge", Driver: "bridge", Labels: "" })
].join("\n")
const parsedBundle = M.parseResourceBundle(bundle, "docker")
assert.strictEqual(parsedBundle.images.length, 1)
assert.strictEqual(parsedBundle.volumes.length, 1)
assert.strictEqual(parsedBundle.networks.length, 1)
assert.ok(M.resourceListScript("docker").indexOf("docker images") >= 0)
assert.ok(M.resourceListScript("podman").indexOf("podman volume ls") >= 0)

const rmJobs = M.bulkJobs([img, namedVol, userNet, bridge], "remove")
assert.strictEqual(rmJobs.length, 3)
assert.deepStrictEqual(rmJobs[0].command, ["docker", "rmi", "f4c02a334659"])
assert.deepStrictEqual(rmJobs[1].command, ["docker", "volume", "rm", "ib-local-ts_akt_runtime"])
assert.deepStrictEqual(rmJobs[2].command, ["docker", "network", "rm", "9bd1c0de341a"])
assert.strictEqual(M.bulkJobs([bridge], "remove").length, 0)
assert.strictEqual(M.searchBy([img, namedVol], "akt_runtime").length, 1)

// ---- i18n

assert.deepStrictEqual(Object.keys(I.LABELS.pt).sort(), Object.keys(I.LABELS.en).sort())
assert.strictEqual(I.label("tlh", "title"), I.LABELS.en.title)
assert.strictEqual(I.projectName("pt", ""), "Outros")
assert.strictEqual(I.projectName("en", "shop"), "shop")
assert.strictEqual(I.engineName("pt", "both"), "Docker + Podman")
assert.strictEqual(I.count("pt", 1), "1 container")
assert.strictEqual(I.count("en", 3), "3 containers")
assert.strictEqual(I.countKind("en", "images", 2), "2 images")
assert.strictEqual(I.countKind("pt", "volumes", 1), "1 volume")
assert.ok(I.searchPlaceholder("en", "images").indexOf("image") >= 0)
assert.ok(I.metaLine("en", img).indexOf("1.35GB") >= 0)
assert.ok(!/undefined|NaN/.test(I.metaLine("en", running)))
assert.ok(I.metaLine("pt", dangling).indexOf("dangling") >= 0)
assert.ok(I.metaLine("pt", anonVol).indexOf("anônimo") >= 0)
assert.ok(I.metaLine("pt", bridge).indexOf("padrão") >= 0)
assert.ok(I.tooltip("pt", stats, true).indexOf("3/4") >= 0)
assert.ok(I.tooltip("en", stats, false).indexOf("PATH") >= 0)
assert.ok(!I.tooltip("en", stats, true, { cpuText: "0/0 (0%)", cpuTotal: 0 }).includes("CPU"))
assert.ok(I.tooltip("en", stats, true, { cpuTotal: 12, cpuText: "0.1/12 (1%)", memText: "1GiB/48GiB", diskText: "10GiB/1TiB" }).indexOf("CPU") >= 0)
assert.ok(I.phrases("pt").length === I.phrases("en").length)

// ---- docker stats / hardware

assert.strictEqual(M.parsePercent("12.50%"), 12.5)
assert.strictEqual(M.parsePercent(""), 0)
assert.strictEqual(M.parseSize("12.3MiB"), 12.3 * 1024 * 1024)
assert.strictEqual(M.parseSize("1.2kB"), 1200)
assert.deepStrictEqual(M.parsePair("10MiB / 2GiB").limit > M.parsePair("10MiB / 2GiB").used, true)
assert.strictEqual(M.formatBytes(0), "0B")
assert.ok(M.formatBytes(3 * 1024 * 1024).indexOf("MiB") >= 0)
assert.strictEqual(M.formatPercent(12.4), "12.4%")
assert.strictEqual(M.barEngine({ engine: "podman" }, true, true), "podman")
assert.strictEqual(M.barEngine({ engine: "both" }, true, true), "docker")
assert.strictEqual(M.barEngine(null, false, true), "podman")

const statsJson = {
  ID: "abc1e4985a70",
  Name: "ib_local_ai_backend",
  CPUPerc: "12.50%",
  MemUsage: "128MiB / 2GiB",
  MemPerc: "6.25%",
  NetIO: "1.2kB / 800B",
  BlockIO: "0B / 0B",
  PIDs: "7"
}
const stat = M.normalizeStat(statsJson)
assert.strictEqual(stat.name, "ib_local_ai_backend")
assert.strictEqual(stat.cpu, 12.5)
assert.strictEqual(stat.pids, 7)
assert.ok(stat.memUsed > 0)

const table = [
  "CONTAINER ID   NAME                    CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O    PIDS",
  "abc1e4985a70   ib_local_ai_backend     12.50%    128MiB / 2GiB         6.25%     1.2kB / 800B      0B / 0B      7",
  "e701522149cd   ib_local_document       1.00%     64MiB / 1GiB          6.25%     0B / 0B           0B / 0B      3"
].join("\n")
const fromTable = M.parseStats(table)
assert.strictEqual(fromTable.ok, true)
assert.strictEqual(fromTable.rows.length, 2)
assert.strictEqual(fromTable.rows[0].name, "ib_local_ai_backend")
assert.strictEqual(fromTable.rows[0].cpu, 12.5)

const fromJson = M.parseStats(JSON.stringify([statsJson]))
assert.strictEqual(fromJson.rows[0].cpu, 12.5)

const hw = M.hardware(fromTable.rows)
assert.strictEqual(hw.cpu, 13.5)
assert.strictEqual(hw.pids, 10)

const host = { cpuTotal: 12, memTotal: 48 * 1024 * 1024 * 1024, diskTotal: 1000 * 1024 * 1024 * 1024 }
const composed = M.composeHardware(fromTable.rows, host, 57e9)
assert.strictEqual(composed.cpuTotal, 12)
assert.ok(Math.abs(composed.cpuUsed - 0.135) < 0.001)
assert.ok(composed.memUsed > 0)
assert.ok(composed.memPerc < 1)
assert.strictEqual(composed.diskUsed, 57e9)
assert.ok(composed.cpuText.indexOf("/12") >= 0)
assert.ok(composed.memText.indexOf("48GiB") >= 0)
assert.ok(M.formatUsedTotal(20 * 1024 * 1024 * 1024, 48 * 1024 * 1024 * 1024, "bytes").indexOf("20GiB/48GiB") >= 0)

const df = M.parseSystemDf([
  '{"Type":"Images","Size":"23.83GB"}',
  '{"Type":"Containers","Size":"2.487GB"}',
  '{"Type":"Local Volumes","Size":"1.745GB"}',
  '{"Type":"Build Cache","Size":"29.32GB"}'
].join("\n"))
assert.ok(df.used > 57e9 && df.used < 58e9)
assert.strictEqual(M.parseHost('{"cpuTotal":12,"memTotal":49753886720,"diskTotal":998037782528}').cpuTotal, 12)

const statsNdjson = JSON.stringify(statsJson) + "\n" + JSON.stringify({ ID: "e701522149cd", Name: "ib_local_document", CPUPerc: "1.00%", MemUsage: "64MiB / 1GiB", MemPerc: "6.25%", NetIO: "0B / 0B", BlockIO: "0B / 0B", PIDs: "3" }) + "\n"
const fromNdjsonStats = M.parseStats(statsNdjson)
assert.strictEqual(fromNdjsonStats.ok, true)
assert.strictEqual(fromNdjsonStats.rows.length, 2)
assert.strictEqual(fromNdjsonStats.rows[1].cpu, 1)

const withHw = M.attachStats(fromDocker.containers, fromTable.rows)
assert.strictEqual(withHw[0].name === "ib_local_ai_backend" ? withHw[0].cpu : withHw[1].cpu, 12.5)

const meta = I.metaLine("en", withHw.find(c => c.cpu !== undefined) || withHw[0])
assert.ok(meta.indexOf("CPU") >= 0 || withHw.every(c => c.cpu === undefined))

console.log("ok — parser, compose labels, docker+podman, grouping, hardware stats and 2 languages")
