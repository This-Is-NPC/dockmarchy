// Container list, pure and without Qt. Docker and Podman both speak JSON;
// this file turns that into one shape so the panel never cares which engine
// answered. Tests run it with `node test/model-test.js`.

function trimSlash(name) {
  var value = String(name || "")
  return value.charAt(0) === "/" ? value.slice(1) : value
}

function firstName(value) {
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var name = trimSlash(value[i])
      if (name) return name
    }
    return ""
  }
  return trimSlash(value)
}

// Docker's `ps --format '{{json .}}'` flattens labels into a comma-separated
// `k=v` string. Compose's depends_on values contain commas, so a split on
// comma is wrong; walk `key=` tokens instead.
function parseLabelString(text) {
  var map = {}
  var raw = String(text || "")
  if (raw === "") return map
  var re = /(?:^|,)([A-Za-z0-9][A-Za-z0-9._/-]*)=/g
  var match
  var parts = []
  while ((match = re.exec(raw)) !== null) {
    parts.push({ key: match[1], valueStart: match.index + match[0].length, matchIndex: match.index })
  }
  for (var i = 0; i < parts.length; i++) {
    var end = i + 1 < parts.length ? parts[i + 1].matchIndex : raw.length
    map[parts[i].key] = raw.slice(parts[i].valueStart, end)
  }
  return map
}

function parseLabels(labels) {
  if (!labels) return {}
  if (typeof labels === "object" && !Array.isArray(labels)) return labels
  return parseLabelString(labels)
}

function projectOf(labels) {
  return String(labels["com.docker.compose.project"] || labels["io.podman.compose.project"] || "")
}

function serviceOf(labels) {
  return String(labels["com.docker.compose.service"] || labels["io.podman.compose.service"] || "")
}

function formatPorts(ports) {
  if (ports === undefined || ports === null || ports === "") return ""
  if (typeof ports === "string") return ports
  if (!Array.isArray(ports)) return String(ports)
  var parts = []
  for (var i = 0; i < ports.length; i++) {
    var p = ports[i]
    if (p === undefined || p === null) continue
    if (typeof p === "string") {
      if (p) parts.push(p)
      continue
    }
    var host = p.host_port || p.HostPort || p.hostPort || ""
    var dest = p.container_port || p.ContainerPort || p.containerPort || ""
    var proto = p.protocol || p.Protocol || "tcp"
    if (host && dest) parts.push(host + ":" + dest + "/" + proto)
    else if (dest) parts.push(dest + "/" + proto)
    else if (host) parts.push(String(host))
  }
  return parts.join(", ")
}

function normalizeState(raw) {
  var value = String(raw || "").trim().toLowerCase()
  if (value === "up" || value.indexOf("up ") === 0) return "running"
  if (value.indexOf("exited") === 0) return "exited"
  if (value.indexOf("created") === 0) return "created"
  if (value.indexOf("paused") === 0) return "paused"
  if (value.indexOf("restarting") === 0) return "restarting"
  if (value.indexOf("dead") === 0) return "dead"
  if (value.indexOf("removing") === 0) return "removing"
  return value
}

function normalizeHealth(raw) {
  var value = String(raw || "").trim().toLowerCase()
  if (value === "" || value === "none" || value === "n/a") return ""
  return value
}

function isRunning(state) {
  return state === "running" || state === "restarting"
}

function isProblem(state, health) {
  if (state === "restarting" || state === "dead" || state === "paused") return true
  return state === "running" && health === "unhealthy"
}

function normalize(raw, engine) {
  if (!raw || typeof raw !== "object") return null
  var id = String(raw.ID || raw.Id || raw.id || "")
  if (id === "") return null

  var labels = parseLabels(raw.Labels || raw.labels || {})
  var state = normalizeState(raw.State || "")
  if (state === "") state = normalizeState(raw.Status || "")
  var health = normalizeHealth(raw.HealthStatus || raw.Health || raw.health || "")
  var name = firstName(raw.Names || raw.Name || raw.names || raw.name || "")
  if (name === "") name = id.slice(0, 12)

  return {
    id: id,
    containerId: id,
    shortId: id.slice(0, 12),
    name: name,
    image: String(raw.Image || raw.image || ""),
    state: state,
    status: String(raw.Status || raw.status || ""),
    health: health,
    running: isRunning(state),
    problem: isProblem(state, health),
    ports: formatPorts(raw.Ports || raw.ports),
    project: projectOf(labels),
    service: serviceOf(labels),
    engine: engine === "podman" ? "podman" : "docker",
    kind: "container",
    removable: false
  }
}

function isNoneRef(value) {
  var s = String(value || "").trim().toLowerCase()
  return s === "" || s === "<none>"
}

function splitRepoTag(value) {
  var s = firstName(value)
  if (isNoneRef(s)) return { repository: "", tag: "" }
  var slash = s.lastIndexOf("/")
  var colon = s.lastIndexOf(":")
  if (colon > slash) return { repository: s.slice(0, colon), tag: s.slice(colon + 1) }
  return { repository: s, tag: "" }
}

function imageRef(repository, tag) {
  if (!repository) return ""
  return tag ? repository + ":" + tag : repository
}

function normalizeImage(raw, engine) {
  if (!raw || typeof raw !== "object") return null
  var id = String(raw.ID || raw.Id || raw.id || "").replace(/^sha256:/, "")
  if (id === "") return null
  var repo = String(raw.Repository || raw.repository || "")
  var tag = String(raw.Tag || raw.tag || "")
  if (!repo && !tag) {
    var split = splitRepoTag(raw.Names || raw.names || raw.NamesHistory || "")
    repo = split.repository
    tag = split.tag
  }
  if (isNoneRef(repo)) repo = ""
  if (isNoneRef(tag)) tag = ""
  var dangling = !repo || raw.Dangling === true || raw.dangling === true
  var used = parseInt(String(raw.Containers !== undefined ? raw.Containers : (raw.containers !== undefined ? raw.containers : "0")), 10)
  if (!isFinite(used) || used < 0) used = 0
  var sizeRaw = raw.Size !== undefined ? raw.Size : raw.size
  var size = typeof sizeRaw === "number" ? sizeRaw : parseSize(sizeRaw)
  var name = imageRef(repo, tag) || id.slice(0, 12)
  return {
    kind: "image",
    id: id,
    resourceId: id,
    shortId: id.slice(0, 12),
    name: name,
    repository: repo,
    tag: tag,
    project: repo,
    engine: engine === "podman" ? "podman" : "docker",
    size: size,
    sizeText: typeof sizeRaw === "string" && String(sizeRaw).trim() !== "" ? String(sizeRaw).trim() : formatBytes(size),
    created: String(raw.CreatedSince || raw.CreatedAt || raw.created || ""),
    used: used,
    dangling: dangling,
    running: used > 0,
    problem: false,
    removable: true,
    inUse: used > 0
  }
}

function isAnonymousVolume(name, labels) {
  if (labels && (labels["com.docker.volume.anonymous"] !== undefined || labels["com.docker.volume.anonymous"] === ""))
    return true
  return /^[a-f0-9]{64}$/.test(String(name || ""))
}

function normalizeVolume(raw, engine) {
  if (!raw || typeof raw !== "object") return null
  var name = firstName(raw.Name || raw.Names || raw.name || "")
  if (name === "") return null
  var labels = parseLabels(raw.Labels || raw.labels || {})
  var project = projectOf(labels)
  var anonymous = isAnonymousVolume(name, labels)
  var driver = String(raw.Driver || raw.driver || "")
  return {
    kind: "volume",
    id: name,
    resourceId: name,
    shortId: name.slice(0, 12),
    name: name,
    project: project,
    engine: engine === "podman" ? "podman" : "docker",
    driver: driver,
    scope: String(raw.Scope || raw.scope || ""),
    mountpoint: String(raw.Mountpoint || raw.MountPoint || raw.mountpoint || ""),
    anonymous: anonymous,
    running: !anonymous,
    problem: false,
    removable: true
  }
}

function isBuiltinNetwork(name) {
  var n = String(name || "").toLowerCase()
  return n === "bridge" || n === "host" || n === "none" || n === "podman" || n === "pasta"
}

function normalizeNetwork(raw, engine) {
  if (!raw || typeof raw !== "object") return null
  var id = String(raw.ID || raw.Id || raw.id || "")
  var name = firstName(raw.Name || raw.Names || raw.name || "")
  if (!id && !name) return null
  if (!name) name = id.slice(0, 12)
  if (!id) id = name
  var labels = parseLabels(raw.Labels || raw.labels || {})
  var builtin = isBuiltinNetwork(name)
  var internal = String(raw.Internal || raw.internal || "") === "true" || raw.Internal === true
  return {
    kind: "network",
    id: id,
    resourceId: id,
    shortId: id.slice(0, 12),
    name: name,
    project: projectOf(labels),
    engine: engine === "podman" ? "podman" : "docker",
    driver: String(raw.Driver || raw.driver || ""),
    scope: String(raw.Scope || raw.scope || ""),
    internal: internal,
    builtin: builtin,
    running: !builtin,
    problem: false,
    removable: !builtin
  }
}

function mapResources(rows, engine, normalizeOne) {
  var out = []
  for (var i = 0; i < (rows || []).length; i++) {
    var item = normalizeOne(rows[i], engine)
    if (item) out.push(item)
  }
  return sortContainers(out)
}

function parseImages(raw, engine) {
  return { ok: true, items: mapResources(parseJsonRows(raw), engine, normalizeImage) }
}

function parseVolumes(raw, engine) {
  return { ok: true, items: mapResources(parseJsonRows(raw), engine, normalizeVolume) }
}

function parseNetworks(raw, engine) {
  return { ok: true, items: mapResources(parseJsonRows(raw), engine, normalizeNetwork) }
}

function resourceListScript(engine) {
  var bin = engine === "podman" ? "podman" : "docker"
  if (engine === "podman") {
    return bin + " images --format json; echo ---DOCKMARCHY-VOLUMES---; "
      + bin + " volume ls --format json; echo ---DOCKMARCHY-NETWORKS---; "
      + bin + " network ls --format json"
  }
  return bin + " images --format '{{json .}}'; echo ---DOCKMARCHY-VOLUMES---; "
    + bin + " volume ls --format '{{json .}}'; echo ---DOCKMARCHY-NETWORKS---; "
    + bin + " network ls --format '{{json .}}'"
}

function parseResourceBundle(raw, engine) {
  var text = String(raw || "")
  var volParts = text.split("---DOCKMARCHY-VOLUMES---")
  var netParts = String(volParts[1] || "").split("---DOCKMARCHY-NETWORKS---")
  return {
    ok: true,
    images: parseImages(volParts[0] || "", engine).items,
    volumes: parseVolumes(netParts[0] || "", engine).items,
    networks: parseNetworks(netParts[1] || "", engine).items
  }
}

function sortContainers(list) {
  return list.slice().sort(function (a, b) {
    if (a.problem !== b.problem) return a.problem ? -1 : 1
    if (a.running !== b.running) return a.running ? -1 : 1
    var pa = a.project || "~"
    var pb = b.project || "~"
    if (pa < pb) return -1
    if (pa > pb) return 1
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })
}

function parseRows(value, engine) {
  var containers = []
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var row = normalize(value[i], engine)
      if (row) containers.push(row)
    }
    return { ok: true, containers: sortContainers(containers) }
  }
  if (value && typeof value === "object") {
    var one = normalize(value, engine)
    return { ok: true, containers: one ? [one] : [] }
  }
  return { ok: false, error: "unexpected json" }
}

function parseNdjson(text, engine) {
  var lines = String(text || "").split(/\r?\n/)
  var containers = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var row
    try { row = JSON.parse(line) } catch (err) { return { ok: false, error: "invalid json" } }
    var item = normalize(row, engine)
    if (item) containers.push(item)
  }
  return { ok: true, containers: sortContainers(containers) }
}

function parseList(raw, engine) {
  var text = String(raw || "").trim()
  if (text === "") return { ok: true, containers: [] }
  try {
    return parseRows(JSON.parse(text), engine)
  } catch (e) {
    return parseNdjson(text, engine)
  }
}

function mergeLists() {
  var containers = []
  for (var i = 0; i < arguments.length; i++) {
    var list = arguments[i]
    if (!list || !list.length) continue
    for (var j = 0; j < list.length; j++) containers.push(list[j])
  }
  return sortContainers(containers)
}

function summary(containers) {
  var list = containers || []
  var total = list.length
  var running = 0
  var stopped = 0
  var unhealthy = 0
  var engines = {}
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    engines[item.engine] = true
    if (item.running) running++
    else stopped++
    if (item.problem) unhealthy++
  }
  var names = Object.keys(engines)
  var engine = ""
  if (names.length === 1) engine = names[0]
  else if (names.length > 1) engine = "both"
  return {
    total: total,
    running: running,
    stopped: stopped,
    unhealthy: unhealthy,
    engine: engine
  }
}

function filterBy(containers, filter) {
  var list = containers || []
  if (filter === "running") {
    return list.filter(function (item) { return item.running })
  }
  if (filter === "stopped") {
    return list.filter(function (item) { return !item.running })
  }
  if (filter === "problem") {
    return list.filter(function (item) { return item.problem })
  }
  return list
}

function searchHaystack(container) {
  if (!container) return ""
  return [
    container.name,
    container.service,
    container.project,
    container.image,
    container.repository,
    container.tag,
    container.driver,
    container.status,
    container.state,
    container.shortId,
    container.ports,
    container.engine,
    container.kind,
    container.sizeText,
    container.mountpoint
  ].join(" ").toLowerCase()
}

function searchBy(containers, query) {
  var list = containers || []
  var needle = String(query || "").trim().toLowerCase()
  if (needle === "") return list
  return list.filter(function (item) {
    return searchHaystack(item).indexOf(needle) >= 0
  })
}

function resourceKey(item) {
  if (!item) return ""
  var kind = String(item.kind || "container")
  if (kind === "container") {
    var cid = String(item.containerId || item.shortId || "")
    if (!cid) return ""
    return String(item.engine || "docker") + ":" + cid
  }
  var rid = String(item.resourceId || item.shortId || item.name || "")
  if (!rid) return ""
  return kind + ":" + String(item.engine || "docker") + ":" + rid
}

function containerKey(container) {
  return resourceKey(container)
}

function bulkJobs(list, verb) {
  var action = String(verb || "")
  if (action === "remove" || action === "rm") return removeJobs(list)
  if (action !== "start" && action !== "stop" && action !== "restart") return []
  var dockerIds = []
  var podmanIds = []
  var seen = {}
  for (var i = 0; i < (list || []).length; i++) {
    var item = list[i]
    if (!item || (item.kind && item.kind !== "container")) continue
    if (!item || !(item.containerId || item.id)) continue
    if (action === "start" && item.running) continue
    if (action === "stop" && !item.running) continue
    var key = containerKey(item)
    if (seen[key]) continue
    seen[key] = true
    if (item.engine === "podman") podmanIds.push(item.containerId || item.id)
    else dockerIds.push(item.containerId || item.id)
  }
  var jobs = []
  if (dockerIds.length) jobs.push({ engine: "docker", verb: action, ids: dockerIds })
  if (podmanIds.length) jobs.push({ engine: "podman", verb: action, ids: podmanIds })
  return jobs
}

function removeJobs(list) {
  var buckets = {}
  var seen = {}
  for (var i = 0; i < (list || []).length; i++) {
    var item = list[i]
    if (!item || item.removable === false) continue
    var kind = String(item.kind || "")
    if (kind !== "image" && kind !== "volume" && kind !== "network") continue
    var engine = item.engine === "podman" ? "podman" : "docker"
    var id = String(item.resourceId || item.name || "")
    if (!id) continue
    var key = resourceKey(item)
    if (seen[key]) continue
    seen[key] = true
    var bucket = engine + ":" + kind
    if (!buckets[bucket]) buckets[bucket] = { engine: engine, kind: kind, ids: [] }
    buckets[bucket].ids.push(id)
  }
  var order = ["docker:image", "docker:volume", "docker:network", "podman:image", "podman:volume", "podman:network"]
  var jobs = []
  for (var j = 0; j < order.length; j++) {
    var group = buckets[order[j]]
    if (!group || !group.ids.length) continue
    jobs.push({
      engine: group.engine,
      verb: "remove",
      ids: group.ids,
      command: removeCommand(group.engine, group.kind, group.ids)
    })
  }
  return jobs
}

function removeCommand(engine, kind, ids) {
  var bin = engine === "podman" ? "podman" : "docker"
  if (kind === "image") return [bin, "rmi"].concat(ids)
  if (kind === "volume") return [bin, "volume", "rm"].concat(ids)
  if (kind === "network") return [bin, "network", "rm"].concat(ids)
  return []
}

function logsCap() {
  return 12
}

function shQuote(value) {
  return "'" + String(value || "").replace(/'/g, "'\\''") + "'"
}

function logLaunchCommand(container) {
  var engine = String(container && container.engine ? container.engine : "docker")
  var name = String(container && container.name ? container.name : "")
  var follow = container && container.running ? " -f" : ""
  var inner = engine + " logs" + follow + " --tail 200 " + shQuote(name)
    + "; printf '\\n'; read -n 1 -s -r || true"
  return "xdg-terminal-exec -- bash -lc " + shQuote(inner)
}

function groupByProject(containers) {
  var list = containers || []
  var order = []
  var map = {}
  for (var i = 0; i < list.length; i++) {
    var key = list[i].project || ""
    if (!map[key]) {
      map[key] = { name: key, running: 0, total: 0, problem: 0, containers: [] }
      order.push(key)
    }
    var group = map[key]
    group.containers.push(list[i])
    group.total++
    if (list[i].running) group.running++
    if (list[i].problem) group.problem++
  }
  return order.map(function (key) { return map[key] })
}

function barLabel(stats) {
  if (!stats) return "—"
  return String(stats.running)
}

function nextAction(container) {
  if (!container) return ""
  return container.running ? "stop" : "start"
}

function parsePercent(value) {
  var n = parseFloat(String(value || "").replace("%", "").replace(",", ".").trim())
  return isFinite(n) ? n : 0
}

function parsePids(value) {
  var n = parseInt(String(value || "0").trim(), 10)
  return isFinite(n) && n > 0 ? n : 0
}

function parseSize(text) {
  var s = String(text || "").trim().replace(/,/g, "")
  if (s === "" || s === "--" || s === "0") return 0
  var match = s.match(/^([\d.]+)\s*([A-Za-z]+)?/)
  if (!match) return 0
  var n = parseFloat(match[1])
  if (!isFinite(n)) return 0
  var unit = (match[2] || "B").toUpperCase()
  var mul = 1
  if (unit === "KB" || unit === "K") mul = 1000
  else if (unit === "KIB" || unit === "KI") mul = 1024
  else if (unit === "MB" || unit === "M") mul = 1000 * 1000
  else if (unit === "MIB" || unit === "MI") mul = 1024 * 1024
  else if (unit === "GB" || unit === "G") mul = 1000 * 1000 * 1000
  else if (unit === "GIB" || unit === "GI") mul = 1024 * 1024 * 1024
  else if (unit === "TB" || unit === "T") mul = 1000 * 1000 * 1000 * 1000
  else if (unit === "TIB" || unit === "TI") mul = 1024 * 1024 * 1024 * 1024
  return n * mul
}

function parsePair(text) {
  var parts = String(text || "").split("/")
  return { used: parseSize(parts[0]), limit: parseSize(parts[1]) }
}

function formatBytes(n) {
  var value = Number(n)
  if (!isFinite(value) || value <= 0) return "0B"
  var units = ["B", "KiB", "MiB", "GiB", "TiB"]
  var i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  var digits = (i === 0 || value >= 10) ? 0 : 1
  return value.toFixed(digits) + units[i]
}

function formatPercent(n) {
  var value = Number(n)
  if (!isFinite(value)) return "0%"
  if (value > 0 && value < 0.1) return "<0.1%"
  if (Math.abs(value - Math.round(value)) < 0.05) return Math.round(value) + "%"
  return value.toFixed(1) + "%"
}

function formatCores(n) {
  var value = Number(n)
  if (!isFinite(value) || value <= 0) return "0"
  if (value > 0 && value < 0.1) return "<0.1"
  if (value >= 10 || Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value))
  return value.toFixed(1)
}

function formatUsedTotal(used, total, kind) {
  var perc = total > 0 ? (Number(used) / Number(total)) * 100 : 0
  var left = kind === "cpu" ? formatCores(used) : formatBytes(used)
  var right = kind === "cpu" ? formatCores(total) : formatBytes(total)
  return left + "/" + right + " (" + formatPercent(perc) + ")"
}

function emptyHost() {
  return { cpuTotal: 0, memTotal: 0, diskTotal: 0 }
}

function parseHost(raw) {
  var text = String(raw || "").trim()
  if (text === "") return emptyHost()
  try {
    var obj = JSON.parse(text)
    return {
      cpuTotal: Math.max(0, parseInt(obj.cpuTotal, 10) || 0),
      memTotal: Math.max(0, Number(obj.memTotal) || 0),
      diskTotal: Math.max(0, Number(obj.diskTotal) || 0)
    }
  } catch (e) {
    return emptyHost()
  }
}

function parseJsonRows(raw) {
  var text = String(raw || "").trim()
  if (text === "") return []
  try {
    var parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === "object") return [parsed]
  } catch (e) {
    var lines = text.split(/\r?\n/)
    var rows = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      try { rows.push(JSON.parse(line)) } catch (err) { return [] }
    }
    return rows
  }
  return []
}

function parseSystemDf(raw) {
  var rows = parseJsonRows(raw)
  var used = 0
  var parts = {}
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {}
    var type = String(row.Type || row.type || "")
    var size = parseSize(row.Size || row.size || "")
    if (type) parts[type] = size
    used += size
  }
  return { ok: true, used: used, parts: parts }
}

function sliceTableColumn(line, start, end) {
  var text = String(line || "")
  if (start < 0 || start >= text.length) return ""
  if (end < 0) return text.substring(start).trim()
  return text.substring(start, Math.min(end, text.length)).trim()
}

function normalizeStat(raw) {
  if (!raw || typeof raw !== "object") return null
  var name = firstName(raw.Name || raw.Names || raw.name || raw.Container || "")
  var id = String(raw.ID || raw.Id || raw.id || raw.Container || "")
  if (!name && !id) return null
  var mem = parsePair(raw.MemUsage || raw.Mem || raw.mem_usage || "")
  var net = parsePair(raw.NetIO || raw.NetIO || raw.net_io || "")
  var block = parsePair(raw.BlockIO || raw.BlockIO || raw.block_io || "")
  var cpu = parsePercent(raw.CPUPerc !== undefined ? raw.CPUPerc : (raw.CPU !== undefined ? raw.CPU : raw.cpu))
  var memPerc = parsePercent(raw.MemPerc !== undefined ? raw.MemPerc : (raw.MemPercentage !== undefined ? raw.MemPercentage : 0))
  if (memPerc === 0 && mem.limit > 0) memPerc = (mem.used / mem.limit) * 100
  return {
    id: id,
    name: name,
    cpu: cpu,
    memPerc: memPerc,
    memUsed: mem.used,
    memLimit: mem.limit,
    netIn: net.used,
    netOut: net.limit,
    blockIn: block.used,
    blockOut: block.limit,
    pids: parsePids(raw.PIDs !== undefined ? raw.PIDs : raw.pids)
  }
}

function parseStatsJson(value) {
  var rows = []
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var row = normalizeStat(value[i])
      if (row) rows.push(row)
    }
    return { ok: true, rows: rows }
  }
  if (value && typeof value === "object") {
    var one = normalizeStat(value)
    return { ok: true, rows: one ? [one] : [] }
  }
  return { ok: false, error: "unexpected json" }
}

function parseStatsNdjson(text) {
  var lines = String(text || "").split(/\r?\n/)
  var rows = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var parsed
    try { parsed = JSON.parse(line) } catch (err) { return { ok: false, error: "invalid json" } }
    var row = normalizeStat(parsed)
    if (row) rows.push(row)
  }
  return { ok: true, rows: rows }
}

function parseStatsTable(raw) {
  var lines = String(raw || "").split(/\r?\n/)
  var header = ""
  var headerIndex = -1
  for (var i = 0; i < lines.length; i++) {
    if (/CPU\s*%/.test(lines[i]) && /MEM\s*%/.test(lines[i])) {
      header = lines[i]
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) return { ok: false, error: "no stats header" }

  var nameStart = header.indexOf("NAME")
  var cpuStart = header.indexOf("CPU %")
  if (cpuStart < 0) cpuStart = header.search(/CPU\s*%/)
  var memUseStart = header.indexOf("MEM USAGE")
  var memPercStart = header.lastIndexOf("MEM %")
  if (memPercStart < 0) memPercStart = header.search(/MEM\s*%/)
  var netStart = header.indexOf("NET I/O")
  var blockStart = header.indexOf("BLOCK I/O")
  var pidsStart = header.indexOf("PIDS")
  var idStart = header.indexOf("CONTAINER")
  if (nameStart < 0 || cpuStart < 0) return { ok: false, error: "bad stats header" }

  var rows = []
  for (var j = headerIndex + 1; j < lines.length; j++) {
    var line = lines[j]
    if (!line || !line.trim()) continue
    var name = sliceTableColumn(line, nameStart, cpuStart)
    var cpu = sliceTableColumn(line, cpuStart, memUseStart)
    var memUse = sliceTableColumn(line, memUseStart, memPercStart)
    var memPerc = sliceTableColumn(line, memPercStart, netStart >= 0 ? netStart : pidsStart)
    var net = netStart >= 0 ? sliceTableColumn(line, netStart, blockStart >= 0 ? blockStart : pidsStart) : ""
    var block = blockStart >= 0 ? sliceTableColumn(line, blockStart, pidsStart >= 0 ? pidsStart : -1) : ""
    var pids = pidsStart >= 0 ? sliceTableColumn(line, pidsStart, -1) : "0"
    var id = idStart >= 0 && idStart < nameStart ? sliceTableColumn(line, idStart, nameStart) : ""
    var row = normalizeStat({
      ID: id, Name: name, CPUPerc: cpu, MemUsage: memUse, MemPerc: memPerc,
      NetIO: net, BlockIO: block, PIDs: pids
    })
    if (row) rows.push(row)
  }
  return { ok: true, rows: rows }
}

function parseStats(raw) {
  var text = String(raw || "").trim()
  if (text === "") return { ok: true, rows: [] }
  try {
    return parseStatsJson(JSON.parse(text))
  } catch (e) {
    var ndjson = parseStatsNdjson(text)
    if (ndjson.ok && ndjson.rows.length > 0) return ndjson
    return parseStatsTable(text)
  }
}

function hardware(rows) {
  var list = rows || []
  var cpu = 0
  var memUsed = 0
  var memLimit = 0
  var pids = 0
  var netIn = 0
  var netOut = 0
  for (var i = 0; i < list.length; i++) {
    var row = list[i]
    cpu += Number(row.cpu) || 0
    memUsed += Number(row.memUsed) || 0
    memLimit += Number(row.memLimit) || 0
    pids += Number(row.pids) || 0
    netIn += Number(row.netIn) || 0
    netOut += Number(row.netOut) || 0
  }
  var memPerc = memLimit > 0 ? (memUsed / memLimit) * 100 : 0
  return {
    cpu: cpu,
    memUsed: memUsed,
    memLimit: memLimit,
    memPerc: memPerc,
    pids: pids,
    netIn: netIn,
    netOut: netOut
  }
}

// Docker CPU% is 100% = one core. RAM/HD are compared to the host, not
// to each container's (often zero) cgroup limit.
function composeHardware(statRows, host, diskUsed) {
  var live = hardware(statRows)
  var cpuTotal = host && host.cpuTotal > 0 ? Number(host.cpuTotal) : 0
  var memTotal = host && host.memTotal > 0 ? Number(host.memTotal) : 0
  var diskTotal = host && host.diskTotal > 0 ? Number(host.diskTotal) : 0
  var cpuUsed = live.cpu / 100
  var disk = Number(diskUsed) || 0
  var cpuPerc = cpuTotal > 0 ? (cpuUsed / cpuTotal) * 100 : 0
  var memPerc = memTotal > 0 ? (live.memUsed / memTotal) * 100 : 0
  var diskPerc = diskTotal > 0 ? (disk / diskTotal) * 100 : 0
  return {
    cpu: live.cpu,
    cpuUsed: cpuUsed,
    cpuTotal: cpuTotal,
    cpuPerc: cpuPerc,
    cpuText: formatUsedTotal(cpuUsed, cpuTotal, "cpu"),
    memUsed: live.memUsed,
    memLimit: live.memLimit,
    memTotal: memTotal,
    memPerc: memPerc,
    memText: formatUsedTotal(live.memUsed, memTotal, "bytes"),
    diskUsed: disk,
    diskTotal: diskTotal,
    diskPerc: diskPerc,
    diskText: formatUsedTotal(disk, diskTotal, "bytes"),
    pids: live.pids,
    netIn: live.netIn,
    netOut: live.netOut
  }
}

function attachStats(containers, rows) {
  var list = containers || []
  var stats = rows || []
  var byName = {}
  var byId = {}
  for (var i = 0; i < stats.length; i++) {
    var row = stats[i]
    if (row.name) byName[row.name] = row
    if (row.id) {
      byId[row.id] = row
      byId[row.id.slice(0, 12)] = row
    }
  }
  var out = []
  for (var j = 0; j < list.length; j++) {
    var item = list[j]
    var hit = byId[item.id] || byId[item.shortId] || byName[item.name]
    if (!hit) {
      out.push(item)
      continue
    }
    var next = {}
    for (var key in item) next[key] = item[key]
    next.cpu = hit.cpu
    next.memPerc = hit.memPerc
    next.memUsed = hit.memUsed
    next.memLimit = hit.memLimit
    next.memText = formatBytes(hit.memUsed)
    next.netIn = hit.netIn
    next.netOut = hit.netOut
    next.netText = formatBytes(hit.netIn) + " ↓  " + formatBytes(hit.netOut) + " ↑"
    next.pids = hit.pids
    out.push(next)
  }
  return out
}

function barEngine(stats, dockerOk, podmanOk) {
  if (stats && stats.engine === "podman") return "podman"
  if (stats && stats.engine === "docker") return "docker"
  if (stats && stats.engine === "both") return "docker"
  if (dockerOk) return "docker"
  if (podmanOk) return "podman"
  return "docker"
}

if (typeof module !== "undefined") {
  module.exports = {
    trimSlash: trimSlash,
    firstName: firstName,
    parseLabelString: parseLabelString,
    parseLabels: parseLabels,
    projectOf: projectOf,
    serviceOf: serviceOf,
    formatPorts: formatPorts,
    normalizeState: normalizeState,
    normalizeHealth: normalizeHealth,
    isRunning: isRunning,
    isProblem: isProblem,
    normalize: normalize,
    normalizeImage: normalizeImage,
    normalizeVolume: normalizeVolume,
    normalizeNetwork: normalizeNetwork,
    parseImages: parseImages,
    parseVolumes: parseVolumes,
    parseNetworks: parseNetworks,
    resourceListScript: resourceListScript,
    parseResourceBundle: parseResourceBundle,
    sortContainers: sortContainers,
    parseList: parseList,
    mergeLists: mergeLists,
    summary: summary,
    filterBy: filterBy,
    searchBy: searchBy,
    containerKey: containerKey,
    resourceKey: resourceKey,
    bulkJobs: bulkJobs,
    removeJobs: removeJobs,
    removeCommand: removeCommand,
    logsCap: logsCap,
    logLaunchCommand: logLaunchCommand,
    groupByProject: groupByProject,
    barLabel: barLabel,
    nextAction: nextAction,
    parsePercent: parsePercent,
    parsePids: parsePids,
    parseSize: parseSize,
    parsePair: parsePair,
    formatBytes: formatBytes,
    formatPercent: formatPercent,
    formatCores: formatCores,
    formatUsedTotal: formatUsedTotal,
    parseHost: parseHost,
    parseSystemDf: parseSystemDf,
    normalizeStat: normalizeStat,
    parseStats: parseStats,
    parseStatsTable: parseStatsTable,
    hardware: hardware,
    composeHardware: composeHardware,
    attachStats: attachStats,
    barEngine: barEngine
  }
}
