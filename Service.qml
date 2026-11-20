import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Model.js" as Model

Item {
  id: root

  property var settings: ({})
  // Panel sets this. Closed: `ps` only (bar count / urgency). Open: stats, df, resources.
  property bool panelOpen: false

  property bool dockerInstalled: false
  property bool podmanInstalled: false
  property bool dockerOk: false
  property bool podmanOk: false
  property bool refreshing: false
  property var containers: []
  property var images: []
  property var volumes: []
  property var networks: []
  property var stats: ({ total: 0, running: 0, stopped: 0, unhealthy: 0, engine: "" })
  property var hardware: ({
    cpu: 0, cpuUsed: 0, cpuTotal: 0, cpuPerc: 0, cpuText: "0/0 (0%)",
    memUsed: 0, memLimit: 0, memTotal: 0, memPerc: 0, memText: "0B/0B (0%)",
    diskUsed: 0, diskTotal: 0, diskPerc: 0, diskText: "0B/0B (0%)",
    pids: 0, netIn: 0, netOut: 0
  })
  property var host: ({ cpuTotal: 0, memTotal: 0, diskTotal: 0 })
  property string barText: "—"
  property string barEngine: "docker"
  property bool hasProblem: false
  property string statusKind: "no-engine"
  property string lastError: ""
  property string actionStatus: ""
  property string pendingId: ""
  property string pendingAction: ""
  property var pendingIds: ({})
  property var _actionQueue: []

  readonly property bool installed: dockerInstalled || podmanInstalled
  readonly property int refreshIntervalSec: intSetting("refreshIntervalSec", 15, 5, 3600)
  readonly property string enginePref: {
    var value = String(setting("engine", "Auto")).toLowerCase()
    if (value === "docker" || value === "podman") return value
    return "auto"
  }
  // podman-docker exposes the same engine as `podman`. Drop the shim so the
  // panel does not list every container, image, and volume twice.
  property bool dockerEmulatesPodman: false
  readonly property bool suppressDocker: enginePref === "auto" && dockerEmulatesPodman && podmanInstalled
  readonly property bool wantDocker: enginePref !== "podman" && !suppressDocker
  readonly property bool wantPodman: enginePref !== "docker"
  property int _whichLeft: 0
  property bool _whichKnown: false
  property var _dockerContainers: []
  property var _podmanContainers: []
  property bool _dockerDone: true
  property bool _podmanDone: true
  property string _dockerOutput: ""
  property string _dockerError: ""
  property string _podmanOutput: ""
  property string _podmanError: ""
  property string _actionOutput: ""
  property string _actionError: ""
  property var _dockerStats: []
  property var _podmanStats: []
  property bool _dockerStatsDone: true
  property bool _podmanStatsDone: true
  property string _dockerStatsOutput: ""
  property string _dockerStatsError: ""
  property string _podmanStatsOutput: ""
  property string _podmanStatsError: ""
  property var _statRows: []
  property real _dockerDisk: 0
  property real _podmanDisk: 0
  property bool _dockerDfDone: true
  property bool _podmanDfDone: true
  property string _dockerDfOutput: ""
  property string _podmanDfOutput: ""
  property var _dockerImages: []
  property var _podmanImages: []
  property var _dockerVolumes: []
  property var _podmanVolumes: []
  property var _dockerNetworks: []
  property var _podmanNetworks: []
  property bool _dockerResDone: true
  property bool _podmanResDone: true
  property string _dockerResOutput: ""
  property string _podmanResOutput: ""

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function intSetting(name, fallback, min, max) {
    var n = parseInt(String(setting(name, fallback)), 10)
    if (!isFinite(n)) n = fallback
    if (n < min) n = min
    if (n > max) n = max
    return n
  }

  function refresh() {
    if (_whichLeft > 0 || dockerList.running || podmanList.running) return
    refreshing = true
    refreshHostIfNeeded()
    if (shouldProbeWhich()) probeWhich()
    else refreshLists()
  }

  function canList() {
    return (wantDocker && dockerInstalled) || (wantPodman && podmanInstalled)
  }

  function shouldProbeWhich() {
    return !_whichKnown || !canList()
  }

  function probeWhich() {
    _whichLeft = 2
    // Presence and version travel together; `docker --version` also tells us
    // when the CLI is podman in disguise (podman-docker).
    whichDocker.command = ["sh", "-c", "docker --version 2>&1"]
    whichPodman.command = ["which", "podman"]
    whichDocker.running = true
    whichPodman.running = true
    armWatchdog()
  }

  function whichFinished() {
    _whichLeft = Math.max(0, _whichLeft - 1)
    if (_whichLeft > 0) return
    _whichKnown = true
    if (!canList()) {
      refreshing = false
      resetEmpty("no-engine")
      return
    }
    refreshLists()
  }

  function armWatchdog() {
    if (!pollWatchdog.running) pollWatchdog.start()
  }

  function stopProc(proc) {
    if (proc.running) proc.running = false
  }

  function abortPoll() {
    stopProc(whichDocker)
    stopProc(whichPodman)
    _whichLeft = 0
    stopProc(dockerList)
    stopProc(podmanList)
    stopProc(dockerStats)
    stopProc(podmanStats)
    stopProc(dockerDf)
    stopProc(podmanDf)
    stopProc(dockerResources)
    stopProc(podmanResources)
    _dockerDone = true
    _podmanDone = true
    _dockerStatsDone = true
    _podmanStatsDone = true
    _dockerDfDone = true
    _podmanDfDone = true
    _dockerResDone = true
    _podmanResDone = true
    refreshing = false
  }

  function refreshLists() {
    var launched = false
    _dockerContainers = []
    _podmanContainers = []
    dockerOk = false
    podmanOk = false

    if (wantDocker && dockerInstalled) {
      _dockerDone = false
      _dockerOutput = ""
      _dockerError = ""
      dockerList.command = ["docker", "ps", "-a", "--format", "{{json .}}"]
      dockerList.running = true
      launched = true
    } else {
      _dockerDone = true
    }

    if (wantPodman && podmanInstalled) {
      _podmanDone = false
      _podmanOutput = ""
      _podmanError = ""
      podmanList.command = ["podman", "ps", "-a", "--format", "json"]
      podmanList.running = true
      launched = true
    } else {
      _podmanDone = true
    }

    if (!launched) {
      refreshing = false
      resetEmpty("no-engine")
      return
    }
    armWatchdog()
  }

  function maybeApply() {
    if (!_dockerDone || !_podmanDone) return
    refreshing = false
    pollWatchdog.stop()
    containers = Model.mergeLists(_dockerContainers, _podmanContainers)
    stats = Model.summary(containers)
    barText = Model.barLabel(stats)
    barEngine = Model.barEngine(stats, dockerOk, podmanOk)
    hasProblem = stats.unhealthy > 0
    if (containers.length > 0) {
      statusKind = "ok"
      lastError = ""
    } else {
      var err = String(_dockerError || _podmanError || "").trim()
      if (err !== "") lastError = elideStatus(err)
      if (installed && !dockerOk && !podmanOk) statusKind = "daemon-down"
      else statusKind = "ok"
    }
    if (panelOpen) {
      refreshHeavy()
      if (dockerStats.running || podmanStats.running || dockerDf.running || podmanDf.running
          || dockerResources.running || podmanResources.running)
        armWatchdog()
    }
  }

  function refreshHeavy() {
    refreshHostIfNeeded()
    refreshDisk()
    refreshStats()
    refreshResources()
  }

  onPanelOpenChanged: if (panelOpen && (dockerOk || podmanOk)) refreshHeavy()

  function refreshStats() {
    if (dockerStats.running || podmanStats.running) return
    var launched = false
    _dockerStats = []
    _podmanStats = []
    if (wantDocker && dockerInstalled && dockerOk) {
      _dockerStatsDone = false
      _dockerStatsOutput = ""
      _dockerStatsError = ""
      dockerStats.command = ["docker", "stats", "--no-stream", "--format", "{{json .}}"]
      dockerStats.running = true
      launched = true
    } else {
      _dockerStatsDone = true
    }
    if (wantPodman && podmanInstalled && podmanOk) {
      _podmanStatsDone = false
      _podmanStatsOutput = ""
      _podmanStatsError = ""
      podmanStats.command = ["podman", "stats", "--no-stream", "--format", "json"]
      podmanStats.running = true
      launched = true
    } else {
      _podmanStatsDone = true
    }
    if (!launched) maybeApplyStats()
    else armWatchdog()
  }

  function applyEngineStats(engine, exitCode, stdout) {
    var parsed = Model.parseStats(stdout)
    var rows = (exitCode === 0 && parsed.ok) ? parsed.rows : []
    if (engine === "podman") {
      _podmanStats = rows
      _podmanStatsDone = true
    } else {
      _dockerStats = rows
      _dockerStatsDone = true
    }
    maybeApplyStats()
  }

  function maybeApplyStats() {
    if (!_dockerStatsDone || !_podmanStatsDone) return
    var rows = []
    var i
    for (i = 0; i < _dockerStats.length; i++) rows.push(_dockerStats[i])
    for (i = 0; i < _podmanStats.length; i++) rows.push(_podmanStats[i])
    _statRows = rows
    containers = Model.attachStats(containers, rows)
    rebuildHardware()
  }

  function hostKnown() {
    return host && host.cpuTotal > 0 && host.memTotal > 0 && host.diskTotal > 0
  }

  function refreshHostIfNeeded() {
    if (!panelOpen || hostKnown() || hostProc.running) return
    refreshHost()
  }

  function refreshHost() {
    if (hostProc.running) return
    hostProc.command = ["sh", "-c", "cpu=$(nproc); mem=$(awk '/^MemTotal:/{print $2; exit}' /proc/meminfo); disk=$(df -B1 / | awk 'NR==2{print $2}'); printf '{\"cpuTotal\":%s,\"memTotal\":%s,\"diskTotal\":%s}\\n' $cpu $((mem * 1024)) $disk"]
    hostProc.running = true
  }

  function applyHost(stdout) {
    var parsed = Model.parseHost(stdout)
    if (parsed.cpuTotal > 0 || parsed.memTotal > 0 || parsed.diskTotal > 0) host = parsed
    rebuildHardware()
  }

  function refreshDisk() {
    if (dockerDf.running || podmanDf.running) return
    var launched = false
    if (wantDocker && dockerInstalled && dockerOk) {
      _dockerDfDone = false
      _dockerDfOutput = ""
      dockerDf.command = ["docker", "system", "df", "--format", "{{json .}}"]
      dockerDf.running = true
      launched = true
    } else {
      _dockerDfDone = true
      if (!(wantDocker && dockerInstalled && dockerOk)) _dockerDisk = 0
    }
    if (wantPodman && podmanInstalled && podmanOk) {
      _podmanDfDone = false
      _podmanDfOutput = ""
      podmanDf.command = ["podman", "system", "df", "--format", "json"]
      podmanDf.running = true
      launched = true
    } else {
      _podmanDfDone = true
      if (!(wantPodman && podmanInstalled && podmanOk)) _podmanDisk = 0
    }
    if (!launched) rebuildHardware()
    else armWatchdog()
  }

  function applyDisk(engine, exitCode, stdout) {
    var parsed = Model.parseSystemDf(stdout)
    var used = (exitCode === 0 && parsed.ok) ? parsed.used : 0
    if (engine === "podman") {
      _podmanDisk = used
      _podmanDfDone = true
    } else {
      _dockerDisk = used
      _dockerDfDone = true
    }
    if (_dockerDfDone && _podmanDfDone) rebuildHardware()
  }

  function rebuildHardware() {
    hardware = Model.composeHardware(_statRows, host, _dockerDisk + _podmanDisk)
  }

  function refreshResources() {
    if (dockerResources.running || podmanResources.running) return
    var launched = false
    _dockerImages = []
    _podmanImages = []
    _dockerVolumes = []
    _podmanVolumes = []
    _dockerNetworks = []
    _podmanNetworks = []
    if (wantDocker && dockerInstalled && dockerOk) {
      _dockerResDone = false
      _dockerResOutput = ""
      dockerResources.command = ["sh", "-c", Model.resourceListScript("docker")]
      dockerResources.running = true
      launched = true
    } else {
      _dockerResDone = true
    }
    if (wantPodman && podmanInstalled && podmanOk) {
      _podmanResDone = false
      _podmanResOutput = ""
      podmanResources.command = ["sh", "-c", Model.resourceListScript("podman")]
      podmanResources.running = true
      launched = true
    } else {
      _podmanResDone = true
    }
    if (!launched) applyEmptyResources()
    else armWatchdog()
  }

  function applyResources(engine, exitCode, stdout) {
    var parsed = Model.parseResourceBundle(stdout, engine)
    var images = (exitCode === 0 && parsed.ok) ? parsed.images : []
    var volumes = (exitCode === 0 && parsed.ok) ? parsed.volumes : []
    var networks = (exitCode === 0 && parsed.ok) ? parsed.networks : []
    if (engine === "podman") {
      _podmanImages = images
      _podmanVolumes = volumes
      _podmanNetworks = networks
      _podmanResDone = true
    } else {
      _dockerImages = images
      _dockerVolumes = volumes
      _dockerNetworks = networks
      _dockerResDone = true
    }
    maybeApplyResources()
  }

  function maybeApplyResources() {
    if (!_dockerResDone || !_podmanResDone) return
    images = Model.mergeLists(_dockerImages, _podmanImages)
    volumes = Model.mergeLists(_dockerVolumes, _podmanVolumes)
    networks = Model.mergeLists(_dockerNetworks, _podmanNetworks)
  }

  function applyEmptyResources() {
    images = []
    volumes = []
    networks = []
  }

  function applyDocker(exitCode, stdout, stderr) {
    var parsed = Model.parseList(stdout, "docker")
    if (exitCode === 0 && parsed.ok) {
      dockerOk = true
      _dockerContainers = parsed.containers
      _dockerError = ""
    } else {
      dockerOk = false
      _dockerContainers = []
      _dockerError = stderr || parsed.error || "docker ps failed"
    }
    _dockerDone = true
    maybeApply()
  }

  function applyPodman(exitCode, stdout, stderr) {
    var parsed = Model.parseList(stdout, "podman")
    if (exitCode === 0 && parsed.ok) {
      podmanOk = true
      _podmanContainers = parsed.containers
      _podmanError = ""
    } else {
      podmanOk = false
      _podmanContainers = []
      _podmanError = stderr || parsed.error || "podman ps failed"
    }
    _podmanDone = true
    maybeApply()
  }

  function resetEmpty(kind) {
    containers = []
    images = []
    volumes = []
    networks = []
    stats = { total: 0, running: 0, stopped: 0, unhealthy: 0, engine: "" }
    barText = "—"
    barEngine = Model.barEngine(null, dockerInstalled, podmanInstalled)
    hasProblem = false
    _statRows = []
    _dockerDisk = 0
    _podmanDisk = 0
    hardware = Model.composeHardware([], host, 0)
    statusKind = kind
    if (kind === "no-engine") lastError = ""
  }

  function elideStatus(text) {
    var value = String(text || "").replace(/\s+/g, " ").trim()
    return value.length > 140 ? value.substring(0, 137) + "…" : value
  }

  function runContainerAction(container, action) {
    runBulkAction(container ? [container] : [], action)
  }

  function runBulkAction(list, action) {
    var jobs = Model.bulkJobs(list, action)
    if (!jobs.length) return
    var nextQueue = (_actionQueue || []).slice()
    var i
    for (i = 0; i < jobs.length; i++) nextQueue.push(jobs[i])
    _actionQueue = nextQueue
    markPending(list)
    actionStatus = ""
    pumpActions()
  }

  function markPending(list) {
    var next = {}
    var key
    for (key in pendingIds) if (pendingIds[key]) next[key] = true
    for (var i = 0; i < (list || []).length; i++) {
      var item = list[i]
      if (!item) continue
      next[Model.resourceKey(item)] = true
      if (item.containerId) next[item.containerId] = true
      if (item.resourceId) next[item.resourceId] = true
    }
    pendingIds = next
  }

  function pumpActions() {
    if (actionProcess.running) return
    var queue = _actionQueue || []
    if (!queue.length) {
      pendingId = ""
      pendingAction = ""
      pendingIds = {}
      delayedRefresh.restart()
      return
    }
    var job = queue[0]
    _actionQueue = queue.slice(1)
    pendingAction = job.verb
    pendingId = job.ids[0] || ""
    var cmd = job.command
    if (!cmd || !cmd.length) {
      cmd = [job.engine, job.verb]
      for (var i = 0; i < job.ids.length; i++) cmd.push(job.ids[i])
    }
    _actionOutput = ""
    _actionError = ""
    actionProcess.command = cmd
    actionProcess.running = true
  }

  function openLogs(targets) {
    var list = Array.isArray(targets) ? targets : (targets ? [targets] : [])
    if (!list.length) return
    var cap = Model.logsCap()
    var n = Math.min(list.length, cap)
    for (var i = 0; i < n; i++) {
      var item = list[i]
      if (!item || !item.name) continue
      Util.execDetached(Model.logLaunchCommand(item))
    }
    if (list.length > cap) {
      actionStatus = "logs-limited"
      actionStatusTimer.restart()
    }
  }

  Timer {
    id: refreshTimer
    interval: root.refreshIntervalSec * 1000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Timer {
    id: delayedRefresh
    interval: 600
    repeat: false
    onTriggered: root.refresh()
  }

  Timer {
    id: pollWatchdog
    interval: 25000
    repeat: false
    onTriggered: root.abortPoll()
  }

  Timer {
    id: actionStatusTimer
    interval: 2200
    repeat: false
    onTriggered: root.actionStatus = ""
  }

  Process {
    id: whichDocker
    running: false
    command: []
    stdout: StdioCollector { id: whichDockerStdout; waitForEnd: true }
    onExited: function(exitCode) {
      // abortPoll() killed the probe: its exit code says nothing about docker.
      if (root._whichLeft === 0) return
      root.dockerInstalled = exitCode === 0
      root.dockerEmulatesPodman = root.dockerInstalled
        && Model.dockerIsPodmanShim(String(whichDockerStdout.text || ""))
      root.whichFinished()
    }
  }

  Process {
    id: whichPodman
    running: false
    command: []
    onExited: function(exitCode) {
      if (root._whichLeft === 0) return
      root.podmanInstalled = exitCode === 0
      root.whichFinished()
    }
  }

  Process {
    id: dockerList
    running: false
    command: []
    stdout: StdioCollector { id: dockerStdout; waitForEnd: true; onStreamFinished: root._dockerOutput = text }
    stderr: StdioCollector { id: dockerStderr; waitForEnd: true; onStreamFinished: root._dockerError = text }
    onExited: function(exitCode) {
      root.applyDocker(
        exitCode,
        String(dockerStdout.text || root._dockerOutput || ""),
        String(dockerStderr.text || root._dockerError || "")
      )
    }
  }

  Process {
    id: podmanList
    running: false
    command: []
    stdout: StdioCollector { id: podmanStdout; waitForEnd: true; onStreamFinished: root._podmanOutput = text }
    stderr: StdioCollector { id: podmanStderr; waitForEnd: true; onStreamFinished: root._podmanError = text }
    onExited: function(exitCode) {
      root.applyPodman(
        exitCode,
        String(podmanStdout.text || root._podmanOutput || ""),
        String(podmanStderr.text || root._podmanError || "")
      )
    }
  }

  Process {
    id: dockerStats
    running: false
    command: []
    stdout: StdioCollector { id: dockerStatsStdout; waitForEnd: true; onStreamFinished: root._dockerStatsOutput = text }
    stderr: StdioCollector { id: dockerStatsStderr; waitForEnd: true; onStreamFinished: root._dockerStatsError = text }
    onExited: function(exitCode) {
      root.applyEngineStats("docker", exitCode, String(dockerStatsStdout.text || root._dockerStatsOutput || ""))
    }
  }

  Process {
    id: podmanStats
    running: false
    command: []
    stdout: StdioCollector { id: podmanStatsStdout; waitForEnd: true; onStreamFinished: root._podmanStatsOutput = text }
    stderr: StdioCollector { id: podmanStatsStderr; waitForEnd: true; onStreamFinished: root._podmanStatsError = text }
    onExited: function(exitCode) {
      root.applyEngineStats("podman", exitCode, String(podmanStatsStdout.text || root._podmanStatsOutput || ""))
    }
  }

  Process {
    id: hostProc
    running: false
    command: []
    stdout: StdioCollector { id: hostStdout; waitForEnd: true }
    onExited: function() {
      root.applyHost(String(hostStdout.text || ""))
    }
  }

  Process {
    id: dockerDf
    running: false
    command: []
    stdout: StdioCollector { id: dockerDfStdout; waitForEnd: true; onStreamFinished: root._dockerDfOutput = text }
    onExited: function(exitCode) {
      root.applyDisk("docker", exitCode, String(dockerDfStdout.text || root._dockerDfOutput || ""))
    }
  }

  Process {
    id: podmanDf
    running: false
    command: []
    stdout: StdioCollector { id: podmanDfStdout; waitForEnd: true; onStreamFinished: root._podmanDfOutput = text }
    onExited: function(exitCode) {
      root.applyDisk("podman", exitCode, String(podmanDfStdout.text || root._podmanDfOutput || ""))
    }
  }

  Process {
    id: dockerResources
    running: false
    command: []
    stdout: StdioCollector { id: dockerResStdout; waitForEnd: true; onStreamFinished: root._dockerResOutput = text }
    onExited: function(exitCode) {
      root.applyResources("docker", exitCode, String(dockerResStdout.text || root._dockerResOutput || ""))
    }
  }

  Process {
    id: podmanResources
    running: false
    command: []
    stdout: StdioCollector { id: podmanResStdout; waitForEnd: true; onStreamFinished: root._podmanResOutput = text }
    onExited: function(exitCode) {
      root.applyResources("podman", exitCode, String(podmanResStdout.text || root._podmanResOutput || ""))
    }
  }

  Process {
    id: actionProcess
    running: false
    command: []
    stdout: StdioCollector { id: actionStdout; waitForEnd: true; onStreamFinished: root._actionOutput = text }
    stderr: StdioCollector { id: actionStderr; waitForEnd: true; onStreamFinished: root._actionError = text }
    onExited: function(exitCode) {
      var stdout = String(actionStdout.text || root._actionOutput || "")
      var stderr = String(actionStderr.text || root._actionError || "")
      if (exitCode !== 0) {
        root.lastError = root.elideStatus(stderr || stdout || "container command failed")
        root.actionStatus = root.lastError
        actionStatusTimer.restart()
      } else if (root.actionStatus !== "logs-limited") {
        root.lastError = ""
        root.actionStatus = ""
      }
      root.pumpActions()
    }
  }
}
