import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "I18n.js" as I18n

// Dockmarchy: Docker and Podman container status from the Omarchy bar.
//
// The button is a live count. The panel is the list. Polling lives in
// Service.qml so the count stays honest with the panel closed; opening
// only refreshes immediately and focuses the keyboard.
Panel {
  id: root
  moduleName: "io.github.this-is-npc.dockmarchy"
  ipcTarget: "io.github.this-is-npc.dockmarchy"
  manageIpc: false

  property string filter: "all"
  property string kind: "containers"
  property string searchQuery: ""
  property var selectedKeys: []
  property var pendingLogTargets: []
  property string focusSection: "filters"
  property int filterIndex: 0
  property int kindIndex: 0
  property int listIndex: 0
  property bool cursorActive: false
  property int phraseIndex: 0

  readonly property string lang: {
    var value = String(settings && settings.language ? settings.language : "en")
    return value === "pt" ? "pt" : "en"
  }
  readonly property var filterIds: ["all", "running", "stopped"]
  readonly property var kindIds: ["containers", "images", "volumes", "networks"]
  readonly property var catalog: {
    if (kind === "images") return containers.images || []
    if (kind === "volumes") return containers.volumes || []
    if (kind === "networks") return containers.networks || []
    return containers.containers || []
  }
  readonly property var visibleContainers: Model.searchBy(Model.filterBy(catalog, kind === "containers" ? filter : "all"), searchQuery)
  readonly property var groups: Model.groupByProject(visibleContainers)
  readonly property var selectedContainers: {
    var keys = {}
    var i
    for (i = 0; i < selectedKeys.length; i++) keys[selectedKeys[i]] = true
    var out = []
    var list = catalog
    for (i = 0; i < list.length; i++) {
      if (keys[Model.resourceKey(list[i])]) out.push(list[i])
    }
    return out
  }
  readonly property int selectedCount: selectedContainers.length
  readonly property int selectedVisibleCount: {
    var n = 0
    for (var i = 0; i < visibleContainers.length; i++) {
      if (selectedKeys.indexOf(Model.resourceKey(visibleContainers[i])) >= 0) n++
    }
    return n
  }
  readonly property bool allVisibleSelected: visibleContainers.length > 0 && selectedVisibleCount === visibleContainers.length
  readonly property bool vertical: bar ? bar.vertical : false
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color iconColor: containers.hasProblem ? urgent : (containers.stats.running > 0 ? foreground : dim)
  readonly property var activePhrases: I18n.phrases(lang)
  readonly property string heroPhraseText: activePhrases[phraseIndex % activePhrases.length]
  readonly property bool headerHasCursor: cursorActive && focusSection === "header"
  readonly property color hoverFill: bar ? Style.hoverFillFor(bar.foreground, Color.accent) : "transparent"

  function t(key) { return I18n.label(lang, key) }

  function engineTitle() {
    if (!containers.installed) return t("title")
    if (containers.stats.engine) return I18n.engineName(lang, containers.stats.engine)
    if (containers.enginePref === "podman") return t("podman")
    if (containers.enginePref === "docker") return t("docker")
    return t("title")
  }

  function heroMeta() {
    if (containers.statusKind === "no-engine") return t("noEngine")
    if (containers.statusKind === "daemon-down") return t("daemonDown")
    if (kind === "images") {
      var images = (containers.images || []).length
      return images === 0 ? t("emptyImages") : I18n.countKind(lang, "images", images)
    }
    if (kind === "volumes") {
      var volumes = (containers.volumes || []).length
      return volumes === 0 ? t("emptyVolumes") : I18n.countKind(lang, "volumes", volumes)
    }
    if (kind === "networks") {
      var networks = (containers.networks || []).length
      return networks === 0 ? t("emptyNetworks") : I18n.countKind(lang, "networks", networks)
    }
    if (containers.stats.total === 0) return t("empty")
    if (containers.hasProblem || !containers.stats.running) return I18n.count(lang, containers.stats.running) + " · " + containers.stats.total
    return heroPhraseText
  }

  function ensureCursor() {
    if (filterIndex < 0) filterIndex = 0
    if (filterIndex > 2) filterIndex = 2
    if (kindIndex < 0) kindIndex = 0
    if (kindIndex > 3) kindIndex = 3
    if (kind !== "containers" && focusSection === "filters") focusSection = "kinds"
    if (visibleContainers.length === 0) {
      if (focusSection === "list") focusSection = "search"
      listIndex = 0
      return
    }
    if (listIndex >= visibleContainers.length) listIndex = visibleContainers.length - 1
    if (listIndex < 0) listIndex = 0
  }

  function moveCursor(dx, dy) {
    cursorActive = true
    ensureCursor()
    if (focusSection === "header") {
      if (dy > 0) focusSection = "kinds"
      return
    }
    if (focusSection === "kinds") {
      if (dx !== 0) {
        kindIndex = Math.max(0, Math.min(3, kindIndex + dx))
        return
      }
      if (dy < 0) {
        focusSection = "header"
        return
      }
      if (dy > 0) {
        if (kind === "containers") focusSection = "filters"
        else root.focusSearch()
        return
      }
      return
    }
    if (focusSection === "filters") {
      if (dx !== 0) {
        filterIndex = Math.max(0, Math.min(2, filterIndex + dx))
        return
      }
      if (dy < 0) {
        focusSection = "kinds"
        return
      }
      if (dy > 0) {
        root.focusSearch()
        return
      }
      return
    }
    if (focusSection === "search") {
      if (dy < 0) {
        focusSection = kind === "containers" ? "filters" : "kinds"
        return
      }
      if (dy > 0 && visibleContainers.length > 0) {
        focusSection = "list"
        listIndex = 0
      }
      return
    }
    if (focusSection === "list") {
      if (dy < 0 && listIndex === 0) {
        root.focusSearch()
        return
      }
      listIndex = Math.max(0, Math.min(visibleContainers.length - 1, listIndex + dy))
    }
  }

  function activateCursor() {
    ensureCursor()
    if (focusSection === "header") {
      containers.refresh()
      return
    }
    if (focusSection === "kinds") {
      root.setKind(kindIds[kindIndex])
      return
    }
    if (focusSection === "filters") {
      filter = filterIds[filterIndex]
      return
    }
    if (focusSection === "search") {
      root.focusSearch()
      return
    }
    var item = selectedContainer()
    if (item) root.toggleSelected(item)
  }

  function selectedContainer() {
    if (visibleContainers.length === 0) return null
    return visibleContainers[Math.max(0, Math.min(listIndex, visibleContainers.length - 1))]
  }

  function isSelected(item) {
    if (!item) return false
    return selectedKeys.indexOf(Model.resourceKey(item)) >= 0
  }

  function toggleSelected(item) {
    if (!item) return
    var key = Model.resourceKey(item)
    if (!key) return
    var src = selectedKeys || []
    var next = []
    var i
    for (i = 0; i < src.length; i++) next.push(String(src[i]))
    i = next.indexOf(key)
    if (i >= 0) next.splice(i, 1)
    else next.push(key)
    selectedKeys = next
  }

  function groupSelectedCount(group) {
    if (!group || !group.containers) return 0
    var n = 0
    for (var i = 0; i < group.containers.length; i++) {
      if (isSelected(group.containers[i])) n++
    }
    return n
  }

  function setGroupSelected(group, on) {
    if (!group || !group.containers) return
    var map = {}
    var i
    for (i = 0; i < selectedKeys.length; i++) map[selectedKeys[i]] = true
    for (i = 0; i < group.containers.length; i++) {
      var key = Model.resourceKey(group.containers[i])
      if (on) map[key] = true
      else delete map[key]
    }
    selectedKeys = Object.keys(map)
  }

  function toggleGroup(group) {
    if (!group || !group.containers) return
    setGroupSelected(group, groupSelectedCount(group) < group.containers.length)
  }

  function toggleSelectAllVisible() {
    var allOn = allVisibleSelected
    var map = {}
    var i
    for (i = 0; i < selectedKeys.length; i++) map[selectedKeys[i]] = true
    for (i = 0; i < visibleContainers.length; i++) {
      var key = Model.resourceKey(visibleContainers[i])
      if (allOn) delete map[key]
      else map[key] = true
    }
    selectedKeys = Object.keys(map)
  }

  function actionTargets() {
    if (selectedCount > 0) return selectedContainers
    var one = selectedContainer()
    return one ? [one] : []
  }

  function selectedLabel() {
    if (selectedCount === 1) return "1 " + t("selectedOne")
    return selectedCount + " " + t("selected")
  }

  function runSelected(action) {
    containers.runBulkAction(actionTargets(), action)
  }

  function launchLogWindows(targets) {
    var list = Array.isArray(targets) ? targets : (targets ? [targets] : [])
    if (!list.length) return
    var cap = Model.logsCap()
    var n = Math.min(list.length, cap)
    for (var i = 0; i < n; i++) {
      var item = list[i]
      if (!item || !item.name) continue
      var cmd = Model.logLaunchCommand(item)
      if (root.bar && typeof root.bar.run === "function") root.bar.run(cmd)
      else containers.openLogs([item])
    }
  }

  function openSelectedLogs() {
    var list = actionTargets()
    var copy = []
    for (var i = 0; i < list.length; i++) copy.push(list[i])
    pendingLogTargets = copy
    root.close()
    logLaunchTimer.restart()
  }

  function setSearchCursor() {
    cursorActive = true
    focusSection = "search"
  }

  function focusSearch() {
    setSearchCursor()
    if (searchField) searchField.forceActiveFocus()
  }

  function blurSearch() {
    if (keyCatcher) keyCatcher.forceActiveFocus()
  }

  function setKind(next) {
    if (kindIds.indexOf(next) < 0) return
    kind = next
    kindIndex = kindIds.indexOf(next)
  }

  function setKindCursor(index) {
    cursorActive = true
    focusSection = "kinds"
    kindIndex = index
  }

  function setFilterCursor(index) {
    cursorActive = true
    focusSection = "filters"
    filterIndex = index
  }

  function setListCursor(index) {
    cursorActive = true
    focusSection = "list"
    listIndex = index
  }

  function setHeaderCursor() {
    cursorActive = true
    focusSection = "header"
  }

  function scrollItemIntoView(item) {
    if (!listFlick || !item) return
    Qt.callLater(function() {
      if (!item) return
      var margin = Style.space(6)
      var point = item.mapToItem(listFlick.contentItem, 0, 0)
      var top = point.y
      var bottom = top + item.height
      var viewTop = listFlick.contentY
      var viewBottom = viewTop + listFlick.height
      var maxY = Math.max(0, listFlick.contentHeight - listFlick.height)
      if (top < viewTop + margin) listFlick.contentY = Math.max(0, top - margin)
      else if (bottom > viewBottom - margin) listFlick.contentY = Math.min(maxY, bottom + margin - listFlick.height)
    })
  }

  function indexOfContainer(item) {
    if (!item) return -1
    var key = Model.resourceKey(item)
    if (!key) return -1
    for (var i = 0; i < visibleContainers.length; i++) {
      if (Model.resourceKey(visibleContainers[i]) === key) return i
    }
    return -1
  }

  function persistLang(next) {
    if (!root.bar || !root.bar.shell || typeof root.bar.shell.updateEntryInline !== "function") return
    var entry = { id: root.moduleName }
    for (var key in settings) if (key !== "id") entry[key] = settings[key]
    entry.language = next
    root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function toggleLang() {
    persistLang(lang === "pt" ? "en" : "pt")
  }

  function statusColor(container) {
    if (!container) return dim
    if (container.problem) return urgent
    if (container.running) return Color.accent
    return dim
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) {
    cursorActive = false
    searchQuery = ""
    selectedKeys = []
    if (searchField) searchField.text = ""
    if (listFlick) listFlick.contentY = 0
    containers.refresh()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  onKindChanged: {
    selectedKeys = []
    filter = "all"
    listIndex = 0
    if (listFlick) listFlick.contentY = 0
  }
  onVisibleContainersChanged: ensureCursor()

  Service {
    id: containers
    settings: root.settings
    panelOpen: root.opened
  }

  Connections {
    target: containers
    function onContainersChanged() { root.ensureCursor() }
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { containers.refresh(); return "ok" }
    function status(): string { return containers.barText + "/" + String(containers.stats.total || 0) }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    active: containers.hasProblem
    dimmed: !containers.installed || (containers.stats.running === 0 && !containers.hasProblem)
    tooltipText: I18n.tooltip(root.lang, containers.stats, containers.installed, containers.hardware, containers.barEngine)
    iconComponent: Component {
      Item {
        Icon {
          anchors.centerIn: parent
          iconSize: Style.space(13)
          color: root.iconColor
          engine: containers.barEngine
        }
      }
    }

    onPressed: function(b) {
      if (b === Qt.RightButton) containers.refresh()
      else if (b === Qt.MiddleButton) {
        var item = root.visibleContainers.length > 0 ? root.visibleContainers[0] : null
        if (item) {
          root.pendingLogTargets = [item]
          logLaunchTimer.restart()
        }
      } else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(Style.space(800), Style.space(800))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: searchField.activeFocus
      onMoveRequested: function(dx, dy) {
        if (!root.cursorActive) { root.cursorActive = true; return }
        root.moveCursor(dx, dy)
      }
      onActivateRequested: if (root.cursorActive) root.activateCursor()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        var key = text.toLowerCase()
        if (key === "r") containers.refresh()
        else if (key === "/") root.focusSearch()
        else if (key === "a") root.toggleSelectAllVisible()
        else if (key === "c") root.setKind("containers")
        else if (key === "i") root.setKind("images")
        else if (key === "v") root.setKind("volumes")
        else if (key === "n") root.setKind("networks")
        else if (key === "1") root.filter = "all"
        else if (key === "2") root.filter = "running"
        else if (key === "3") root.filter = "stopped"
        else if (key === "s" && root.kind === "containers") root.runSelected("start")
        else if (key === "x" && root.kind === "containers") root.runSelected("stop")
        else if (key === "t" && root.kind === "containers") root.runSelected("restart")
        else if (key === "l" && root.kind === "containers") root.openSelectedLogs()
        else if (key === "d" && root.kind !== "containers") root.runSelected("remove")
      }

      Column {
        id: topChrome
        width: parent.width
        spacing: Style.space(12)

        Item {
          id: header
          width: parent.width
          implicitHeight: hero.implicitHeight
          readonly property bool ringVisible: root.headerHasCursor
          function focusHero() { root.setHeaderCursor() }

          PanelHero {
            id: hero
            width: parent.width
            title: root.engineTitle()
            meta: root.heroMeta()
            detail: {
              if (root.kind === "containers")
                return containers.stats.total > 0 ? containers.stats.running + "/" + containers.stats.total : ""
              return root.catalog.length > 0 ? String(root.catalog.length) : ""
            }
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconOpacity: containers.stats.running > 0 ? 1.0 : 0.5
            iconComponent: Component {
              Icon {
                iconSize: Style.font.display
                color: root.iconColor
                engine: containers.barEngine
              }
            }
          }

          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onEntered: header.focusHero()
            onClicked: containers.refresh()
          }
        }

        Text {
          visible: containers.actionStatus !== "" || containers.lastError !== ""
          width: parent.width
          text: containers.actionStatus === "logs-limited" ? root.t("logsLimited")
            : (containers.actionStatus !== "" ? containers.actionStatus : containers.lastError)
          color: containers.lastError !== "" && containers.actionStatus === "" ? root.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Column {
          visible: containers.hardware.cpuTotal > 0
          width: parent.width
          spacing: Style.space(8)

          PanelSectionHeader {
            text: root.t("hardware").toUpperCase()
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Row {
            width: parent.width
            spacing: Style.space(8)

            Gauge {
              width: (parent.width - parent.spacing * 2) / 3
              label: root.t("cpu")
              percent: containers.hardware.cpuPerc
              detail: Model.formatCores(containers.hardware.cpuUsed) + "/" + Model.formatCores(containers.hardware.cpuTotal)
              hot: containers.hardware.cpuPerc >= 80
              foreground: root.foreground
              fill: Color.accent
              hotFill: root.urgent
              fontFamily: root.fontFamily
            }

            Gauge {
              width: (parent.width - parent.spacing * 2) / 3
              label: root.t("mem")
              percent: containers.hardware.memPerc
              detail: Model.formatBytes(containers.hardware.memUsed) + "/" + Model.formatBytes(containers.hardware.memTotal)
              hot: containers.hardware.memPerc >= 90
              foreground: root.foreground
              fill: Color.accent
              hotFill: root.urgent
              fontFamily: root.fontFamily
            }

            Gauge {
              width: (parent.width - parent.spacing * 2) / 3
              label: root.t("hd")
              percent: containers.hardware.diskPerc
              detail: Model.formatBytes(containers.hardware.diskUsed) + "/" + Model.formatBytes(containers.hardware.diskTotal)
              hot: containers.hardware.diskPerc >= 90
              foreground: root.foreground
              fill: Color.accent
              hotFill: root.urgent
              fontFamily: root.fontFamily
            }
          }
        }

        Row {
          id: kindRow
          width: parent.width
          spacing: Style.space(6)
          readonly property real cellWidth: (width - spacing * 3) / 4

          Repeater {
            model: root.kindIds

            Button {
              required property string modelData
              required property int index
              width: kindRow.cellWidth
              text: root.t(modelData)
              fontSize: Style.font.caption
              foreground: root.foreground
              fontFamily: root.fontFamily
              bordered: true
              active: root.kind === modelData
              hasCursor: root.cursorActive && root.focusSection === "kinds" && root.kindIndex === index
              onClicked: root.setKind(modelData)
              onHovered: function(h) { if (h) root.setKindCursor(index) }
            }
          }
        }

        Row {
          id: filterRow
          visible: root.kind === "containers"
          width: parent.width
          spacing: Style.space(6)
          readonly property real cellWidth: (width - spacing * 2) / 3

          Repeater {
            model: root.filterIds

            Button {
              required property string modelData
              required property int index
              width: filterRow.cellWidth
              text: root.t(modelData)
              fontSize: Style.font.bodySmall
              foreground: root.foreground
              fontFamily: root.fontFamily
              bordered: true
              active: root.filter === modelData
              hasCursor: root.cursorActive && root.focusSection === "filters" && root.filterIndex === index
              onClicked: root.filter = modelData
              onHovered: function(h) { if (h) root.setFilterCursor(index) }
            }
          }
        }

        TextField {
          id: searchField
          width: parent.width
          foreground: root.foreground
          font.pixelSize: Style.font.bodySmall
          verticalPadding: Style.space(4)
          placeholderText: I18n.searchPlaceholder(root.lang, root.kind)
          text: root.searchQuery
          hasCursor: root.cursorActive && root.focusSection === "search" && !activeFocus
          onTextChanged: {
            root.searchQuery = text
            root.listIndex = 0
            if (listFlick) listFlick.contentY = 0
          }
          onHoveredChanged: if (hovered) root.setSearchCursor()
          onActiveFocusChanged: if (activeFocus) root.setSearchCursor()
          Keys.onPressed: function(event) {
            if (event.key === Qt.Key_Down) {
              root.blurSearch()
              if (root.visibleContainers.length > 0) {
                root.cursorActive = true
                root.focusSection = "list"
                root.listIndex = 0
              } else {
                root.cursorActive = true
                root.focusSection = root.kind === "containers" ? "filters" : "kinds"
              }
              event.accepted = true
              return
            }
            if (event.key === Qt.Key_Up) {
              root.blurSearch()
              root.cursorActive = true
              root.focusSection = root.kind === "containers" ? "filters" : "kinds"
              event.accepted = true
              return
            }
            if (event.key === Qt.Key_Escape) {
              if (root.searchQuery !== "") {
                root.searchQuery = ""
                text = ""
              } else {
                root.blurSearch()
                root.cursorActive = true
                root.focusSection = root.kind === "containers" ? "filters" : "kinds"
              }
              event.accepted = true
            }
          }
        }

        RowLayout {
          id: commandBar
          visible: root.visibleContainers.length > 0
          width: parent.width
          spacing: Style.space(6)

          SelectionBox {
            checked: root.allVisibleSelected
            partial: root.selectedVisibleCount > 0 && !root.allVisibleSelected
            onClicked: root.toggleSelectAllVisible()
          }

          Text {
            text: root.selectedCount > 0 ? root.selectedLabel() : root.t("selectAll")
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: root.toggleSelectAllVisible()
            }
          }

          Item { Layout.fillWidth: true }

          PanelActionButton {
            iconText: ""
            tooltipText: root.t("start")
            foreground: root.foreground
            fontFamily: root.fontFamily
            visible: root.kind === "containers"
            enabled: root.selectedCount > 0
            onClicked: root.runSelected("start")
          }

          PanelActionButton {
            iconText: ""
            tooltipText: root.t("stop")
            foreground: root.foreground
            fontFamily: root.fontFamily
            visible: root.kind === "containers"
            enabled: root.selectedCount > 0
            onClicked: root.runSelected("stop")
          }

          PanelActionButton {
            iconText: ""
            tooltipText: root.t("restart")
            foreground: root.foreground
            fontFamily: root.fontFamily
            visible: root.kind === "containers"
            enabled: root.selectedCount > 0
            onClicked: root.runSelected("restart")
          }

          PanelActionButton {
            iconText: ""
            tooltipText: root.t("logs")
            foreground: root.foreground
            fontFamily: root.fontFamily
            visible: root.kind === "containers"
            enabled: root.selectedCount > 0
            onClicked: root.openSelectedLogs()
          }

          PanelActionButton {
            iconText: ""
            tooltipText: root.t("remove")
            foreground: root.foreground
            fontFamily: root.fontFamily
            visible: root.kind !== "containers"
            enabled: root.selectedCount > 0
            onClicked: root.runSelected("remove")
          }
        }
      }

      Item {
        id: listArea
        anchors.top: topChrome.bottom
        anchors.bottom: footer.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.topMargin: Style.space(12)
        anchors.bottomMargin: Style.space(8)

        Text {
          visible: root.visibleContainers.length === 0
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          text: containers.statusKind === "no-engine" ? root.t("noEngine")
            : (containers.statusKind === "daemon-down" ? root.t("daemonDown")
              : (String(root.searchQuery).trim() !== "" ? I18n.noMatchText(root.lang, root.kind) : I18n.emptyText(root.lang, root.kind)))
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
          horizontalAlignment: Text.AlignHCenter
        }

        Flickable {
          id: listFlick
          anchors.fill: parent
          visible: root.groups.length > 0
          contentWidth: width
          contentHeight: groupColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: groupColumn
            width: listFlick.width
            spacing: Style.space(10)

            Repeater {
              model: root.groups

              Column {
                required property var modelData
                width: groupColumn.width
                spacing: Style.space(4)

                Row {
                  width: groupColumn.width
                  spacing: Style.space(6)

                  SelectionBox {
                    anchors.verticalCenter: parent.verticalCenter
                    checked: {
                      var keys = root.selectedKeys
                      var list = modelData.containers || []
                      if (!list.length) return false
                      for (var i = 0; i < list.length; i++) {
                        if (keys.indexOf(Model.resourceKey(list[i])) < 0) return false
                      }
                      return true
                    }
                    partial: {
                      var keys = root.selectedKeys
                      var list = modelData.containers || []
                      var n = 0
                      for (var i = 0; i < list.length; i++) {
                        if (keys.indexOf(Model.resourceKey(list[i])) >= 0) n++
                      }
                      return n > 0 && n < list.length
                    }
                    onClicked: root.toggleGroup(modelData)
                  }

                  PanelSectionHeader {
                    width: parent.width - Style.space(22)
                    text: I18n.projectName(root.lang, modelData.name).toUpperCase()
                      + "  " + (root.kind === "containers" ? (modelData.running + "/" + modelData.total) : String(modelData.total))
                    foreground: modelData.problem > 0 ? root.urgent : root.foreground
                    fontFamily: root.fontFamily

                    TapHandler {
                      gesturePolicy: TapHandler.ReleaseWithinBounds
                      onTapped: root.toggleGroup(modelData)
                    }
                    HoverHandler { cursorShape: Qt.PointingHandCursor }
                  }
                }

                Repeater {
                  model: modelData.containers

                  ContainerRow {
                    required property var modelData
                    required property int index
                    width: groupColumn.width
                    container: modelData
                    rowIndex: root.indexOfContainer(modelData)
                  }
                }
              }
            }
          }
        }
      }

      Item {
        id: footer
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: toolRow.implicitHeight

        Text {
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: containers.enginePref === "auto" ? root.t("subtitle") : root.engineTitle()
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Row {
          id: toolRow
          anchors.right: parent.right
          spacing: Style.space(2)

          Button {
            iconText: ""
            tooltipText: root.t("refresh")
            iconSize: Style.font.body
            foreground: root.foreground
            fontFamily: root.fontFamily
            horizontalPadding: Style.space(9)
            bordered: false
            onClicked: containers.refresh()
          }

          Button {
            text: root.t("langLabel")
            tooltipText: root.t("langLabel")
            fontSize: Style.font.bodySmall
            foreground: root.foreground
            fontFamily: root.fontFamily
            horizontalPadding: Style.space(9)
            bordered: false
            onClicked: root.toggleLang()
          }
        }
      }
    }
  }

  Timer {
    id: logLaunchTimer
    interval: 150
    repeat: false
    onTriggered: {
      var list = root.pendingLogTargets
      root.pendingLogTargets = []
      root.launchLogWindows(list)
    }
  }

  Timer {
    id: phraseTimer
    interval: 2800
    running: root.opened && containers.stats.running > 0 && !containers.hasProblem
    repeat: true
    onTriggered: phraseSwap.restart()
  }

  SequentialAnimation {
    id: phraseSwap
    PropertyAnimation {
      target: hero
      property: "metaOpacity"
      to: 0.0
      duration: 180
      easing.type: Easing.OutQuad
    }
    ScriptAction {
      script: root.phraseIndex = (root.phraseIndex + 1) % root.activePhrases.length
    }
    PropertyAnimation {
      target: hero
      property: "metaOpacity"
      to: 1.0
      duration: 260
      easing.type: Easing.InQuad
    }
  }

  component SelectionBox: Item {
    property bool checked: false
    property bool partial: false
    property bool interactive: true
    signal clicked()

    implicitWidth: Style.space(16)
    implicitHeight: Style.space(16)

    Rectangle {
      anchors.centerIn: parent
      width: Style.space(14)
      height: Style.space(14)
      radius: Style.space(3)
      color: parent.checked ? Color.accent : "transparent"
      border.width: Math.max(1, Style.space(1))
      border.color: parent.checked || parent.partial ? Color.accent : root.dim

      Rectangle {
        visible: parent.parent.partial && !parent.parent.checked
        anchors.centerIn: parent
        width: parent.width - Style.space(6)
        height: Math.max(2, Style.space(2))
        color: Color.accent
      }
    }

    TapHandler {
      enabled: parent.interactive
      gesturePolicy: TapHandler.ReleaseWithinBounds
      onTapped: parent.clicked()
    }
    HoverHandler {
      enabled: parent.interactive
      cursorShape: Qt.PointingHandCursor
    }
  }

  component ContainerRow: CursorSurface {
    id: row
    property var container: null
    property int rowIndex: -1
    readonly property bool pending: !!(container && (
      containers.pendingIds[Model.resourceKey(container)] || containers.pendingIds[container.containerId] || containers.pendingIds[container.resourceId]
    ))
    readonly property bool checked: {
      var keys = root.selectedKeys
      if (!container || !keys) return false
      return keys.indexOf(Model.resourceKey(container)) >= 0
    }

    hasCursor: root.cursorActive && root.focusSection === "list" && root.listIndex === rowIndex && rowIndex >= 0
    current: row.checked
    foreground: root.foreground

    implicitHeight: rowContent.implicitHeight + Style.spacing.rowPaddingX
    onHasCursorChanged: if (hasCursor) root.scrollItemIntoView(row)

    HoverHandler {
      cursorShape: Qt.PointingHandCursor
      onHoveredChanged: if (hovered && row.rowIndex >= 0) root.setListCursor(row.rowIndex)
    }

    TapHandler {
      acceptedButtons: Qt.LeftButton
      gesturePolicy: TapHandler.ReleaseWithinBounds
      onTapped: root.toggleSelected(row.container)
    }

    RowLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(6)
      anchors.rightMargin: Style.space(6)
      spacing: Style.space(8)

      SelectionBox {
        Layout.alignment: Qt.AlignVCenter
        checked: row.checked
        interactive: false
      }

      Rectangle {
        width: Style.space(8)
        height: Style.space(8)
        radius: width / 2
        color: root.statusColor(row.container)
        Layout.alignment: Qt.AlignVCenter
      }

      ColumnLayout {
        id: rowContent
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          text: row.container ? (row.container.service || row.container.name) : ""
          color: row.container && row.container.problem ? root.urgent : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          text: I18n.metaLine(root.lang, row.container)
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
    }
  }
}
