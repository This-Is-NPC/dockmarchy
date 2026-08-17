// Widget copy. Model.js never produces UI strings; everything the panel
// paints as language lives here so swapping pt/en does not touch the list.

var LABELS = {
  pt: {
    title: "Containers",
    subtitle: "docker e podman",
    all: "Todos",
    running: "No ar",
    stopped: "Parados",
    empty: "Nenhum container neste filtro.",
    noEngine: "Nem Docker nem Podman estão no PATH.",
    daemonDown: "O motor está instalado, mas o daemon não responde.",
    refresh: "Atualizar",
    start: "Iniciar",
    stop: "Parar",
    restart: "Reiniciar",
    logs: "Logs",
    langLabel: "EN",
    other: "Outros",
    docker: "Docker",
    podman: "Podman",
    both: "Docker + Podman",
    healthy: "saudável",
    unhealthy: "doente",
    none: "sem healthcheck",
    point: "container",
    points: "containers",
    hardware: "Hardware",
    cpu: "CPU",
    mem: "RAM",
    hd: "HD",
    net: "NET",
    pids: "PIDs",
    searchPlaceholder: "Buscar containers",
    searchImages: "Buscar imagens",
    searchVolumes: "Buscar volumes",
    searchNetworks: "Buscar redes",
    noMatch: "Nenhum container corresponde à busca.",
    noMatchImages: "Nenhuma imagem corresponde à busca.",
    noMatchVolumes: "Nenhum volume corresponde à busca.",
    noMatchNetworks: "Nenhuma rede corresponde à busca.",
    emptyImages: "Nenhuma imagem neste motor.",
    emptyVolumes: "Nenhum volume neste motor.",
    emptyNetworks: "Nenhuma rede neste motor.",
    selectAll: "Todos",
    selected: "selecionados",
    selectedOne: "selecionado",
    logsLimited: "Abrindo 12 janelas de log.",
    containers: "Containers",
    images: "Imagens",
    volumes: "Volumes",
    networks: "Redes",
    remove: "Remover",
    dangling: "dangling",
    anonymous: "anônimo",
    builtin: "padrão",
    internal: "interna",
    image: "imagem",
    imagePoints: "imagens",
    volume: "volume",
    volumePoints: "volumes",
    network: "rede",
    networkPoints: "redes"
  },
  en: {
    title: "Containers",
    subtitle: "docker and podman",
    all: "All",
    running: "Running",
    stopped: "Stopped",
    empty: "No containers in this filter.",
    noEngine: "Neither Docker nor Podman is on PATH.",
    daemonDown: "The engine is installed, but the daemon is not responding.",
    refresh: "Refresh",
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    logs: "Logs",
    langLabel: "PT",
    other: "Other",
    docker: "Docker",
    podman: "Podman",
    both: "Docker + Podman",
    healthy: "healthy",
    unhealthy: "unhealthy",
    none: "no healthcheck",
    point: "container",
    points: "containers",
    hardware: "Hardware",
    cpu: "CPU",
    mem: "RAM",
    hd: "HD",
    net: "NET",
    pids: "PIDs",
    searchPlaceholder: "Search containers",
    searchImages: "Search images",
    searchVolumes: "Search volumes",
    searchNetworks: "Search networks",
    noMatch: "No containers match the search.",
    noMatchImages: "No images match the search.",
    noMatchVolumes: "No volumes match the search.",
    noMatchNetworks: "No networks match the search.",
    emptyImages: "No images on this engine.",
    emptyVolumes: "No volumes on this engine.",
    emptyNetworks: "No networks on this engine.",
    selectAll: "All",
    selected: "selected",
    selectedOne: "selected",
    logsLimited: "Opening 12 log windows.",
    containers: "Containers",
    images: "Images",
    volumes: "Volumes",
    networks: "Networks",
    remove: "Remove",
    dangling: "dangling",
    anonymous: "anonymous",
    builtin: "builtin",
    internal: "internal",
    image: "image",
    imagePoints: "images",
    volume: "volume",
    volumePoints: "volumes",
    network: "network",
    networkPoints: "networks"
  }
}

var PHRASES = {
  pt: [
    "Contando caixas",
    "Olhando o cais",
    "Pastoreando baleias",
    "Conferindo o porto",
    "Empilhando imagens",
    "Vigiando o compose"
  ],
  en: [
    "Counting boxes",
    "Watching the quay",
    "Herding whales",
    "Checking the dock",
    "Stacking images",
    "Watching compose"
  ]
}

function lang(code) { return code === "pt" ? "pt" : "en" }
function label(code, key) { return LABELS[lang(code)][key] }
function phrases(code) { return PHRASES[lang(code)] }

function engineName(code, engine) {
  if (engine === "podman") return label(code, "podman")
  if (engine === "both") return label(code, "both")
  if (engine === "docker") return label(code, "docker")
  return label(code, "title")
}

function projectName(code, name) {
  return name ? name : label(code, "other")
}

function count(code, n) {
  return n + " " + (n === 1 ? LABELS[lang(code)].point : LABELS[lang(code)].points)
}

function countKind(code, kind, n) {
  var table = LABELS[lang(code)]
  if (kind === "images") return n + " " + (n === 1 ? table.image : table.imagePoints)
  if (kind === "volumes") return n + " " + (n === 1 ? table.volume : table.volumePoints)
  if (kind === "networks") return n + " " + (n === 1 ? table.network : table.networkPoints)
  return count(code, n)
}

function searchPlaceholder(code, kind) {
  if (kind === "images") return label(code, "searchImages")
  if (kind === "volumes") return label(code, "searchVolumes")
  if (kind === "networks") return label(code, "searchNetworks")
  return label(code, "searchPlaceholder")
}

function emptyText(code, kind) {
  if (kind === "images") return label(code, "emptyImages")
  if (kind === "volumes") return label(code, "emptyVolumes")
  if (kind === "networks") return label(code, "emptyNetworks")
  return label(code, "empty")
}

function noMatchText(code, kind) {
  if (kind === "images") return label(code, "noMatchImages")
  if (kind === "volumes") return label(code, "noMatchVolumes")
  if (kind === "networks") return label(code, "noMatchNetworks")
  return label(code, "noMatch")
}

function health(code, value) {
  if (value === "healthy") return label(code, "healthy")
  if (value === "unhealthy") return label(code, "unhealthy")
  if (!value) return label(code, "none")
  return value
}

function metaLine(code, container) {
  if (!container) return ""
  var kind = container.kind || "container"
  if (kind === "image") {
    var img = []
    if (container.sizeText) img.push(container.sizeText)
    if (container.used > 0) img.push(container.used + "×")
    if (container.dangling) img.push(label(code, "dangling"))
    if (container.created) img.push(container.created)
    if (container.shortId) img.push(container.shortId)
    return img.join("  ·  ")
  }
  if (kind === "volume") {
    var vol = []
    if (container.driver) vol.push(container.driver)
    if (container.anonymous) vol.push(label(code, "anonymous"))
    if (container.scope) vol.push(container.scope)
    return vol.join("  ·  ")
  }
  if (kind === "network") {
    var net = []
    if (container.driver) net.push(container.driver)
    if (container.builtin) net.push(label(code, "builtin"))
    if (container.internal) net.push(label(code, "internal"))
    if (container.scope) net.push(container.scope)
    return net.join("  ·  ")
  }
  var parts = []
  if (container.running && container.cpu !== undefined)
    parts.push(Number(container.cpu).toFixed(1) + "% CPU")
  if (container.running && container.memPerc !== undefined)
    parts.push((container.memText ? container.memText + " " : "") + Number(container.memPerc).toFixed(1) + "%")
  if (container.status) parts.push(container.status)
  else if (container.state) parts.push(container.state)
  if (container.image) parts.push(container.image)
  if (container.ports) parts.push(container.ports)
  return parts.join("  ·  ")
}

function tooltip(code, stats, installed, hardware, engine) {
  var name = engineName(code, engine || (stats && stats.engine) || "docker")
  if (!installed) return name + "  ·  " + label(code, "noEngine")
  if (!stats || stats.total === 0) return name + "  ·  0"
  var text = name + "  " + stats.running + "/" + stats.total
  if (stats.unhealthy > 0) text += "  ·  " + stats.unhealthy + " " + label(code, "unhealthy")
  if (hardware && Number(hardware.cpuTotal) > 0) {
    text += "  ·  CPU " + hardware.cpuText
    text += "  ·  RAM " + hardware.memText
    text += "  ·  HD " + hardware.diskText
  } else if (hardware && (hardware.cpuPerc || hardware.memPerc)) {
    text += "  ·  CPU " + (Number(hardware.cpuPerc || hardware.cpu) || 0).toFixed(1) + "%"
    text += "  ·  RAM " + (Number(hardware.memPerc) || 0).toFixed(1) + "%"
  }
  return text
}

if (typeof module !== "undefined") {
  module.exports = {
    LABELS: LABELS, PHRASES: PHRASES, lang: lang, label: label, phrases: phrases,
    engineName: engineName, projectName: projectName, count: count, countKind: countKind,
    searchPlaceholder: searchPlaceholder, emptyText: emptyText, noMatchText: noMatchText,
    health: health,
    metaLine: metaLine, tooltip: tooltip
  }
}
