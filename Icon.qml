import QtQuick
import qs.Commons

// Engine mark for the bar and the hero. Docker is Moby with cargo;
// Podman is the seal with the hat. Same silhouette at 12px and 32px.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color color: Color.foreground
  property string engine: "docker"

  width: iconSize
  height: iconSize
  implicitWidth: iconSize
  implicitHeight: iconSize

  readonly property bool podman: engine === "podman"
  readonly property real u: iconSize / 10

  // ---- Docker: five crates on a whale hull ----
  Item {
    visible: !root.podman
    anchors.fill: parent

    Crate { cx: 3.4; cy: 1.35 }
    Crate { cx: 5.5; cy: 1.35 }
    Crate { cx: 1.3; cy: 3.15 }
    Crate { cx: 3.4; cy: 3.15 }
    Crate { cx: 5.5; cy: 3.15 }

    Rectangle {
      x: root.u * 0.7
      y: root.u * 5.05
      width: root.u * 7.4
      height: root.u * 3.4
      radius: root.u * 1.7
      color: root.color
    }

    Rectangle {
      x: root.u * 7.6
      y: root.u * 6.15
      width: root.u * 2.1
      height: root.u * 1.55
      radius: root.u * 0.4
      color: root.color
    }

    Rectangle {
      x: root.u * 2.15
      y: root.u * 6.15
      width: root.u * 0.85
      height: root.u * 0.85
      radius: width / 2
      color: Qt.darker(root.color, 1.8)
    }
  }

  // ---- Podman: seal head and hat ----
  Item {
    visible: root.podman
    anchors.fill: parent

    Rectangle {
      x: root.u * 2.7
      y: root.u * 0.2
      width: root.u * 4.6
      height: root.u * 2.4
      radius: root.u * 0.4
      color: root.color
    }

    Rectangle {
      x: root.u * 4.35
      y: 0
      width: root.u * 1.3
      height: root.u * 1.1
      radius: root.u * 0.25
      color: root.color
    }

    Rectangle {
      x: root.u * 1.6
      y: root.u * 2.15
      width: root.u * 6.8
      height: root.u * 6.8
      radius: width / 2
      color: root.color
    }

    Rectangle {
      x: root.u * 6.4
      y: root.u * 5.7
      width: root.u * 3.1
      height: root.u * 2.0
      radius: height / 2
      color: root.color
    }

    Rectangle {
      x: root.u * 3.1
      y: root.u * 4.35
      width: root.u * 1.15
      height: root.u * 1.15
      radius: width / 2
      color: Qt.darker(root.color, 1.8)
    }

    Rectangle {
      x: root.u * 5.15
      y: root.u * 4.35
      width: root.u * 1.15
      height: root.u * 1.15
      radius: width / 2
      color: Qt.darker(root.color, 1.8)
    }
  }

  component Crate: Rectangle {
    property real cx: 0
    property real cy: 0
    x: root.u * cx
    y: root.u * cy
    width: root.u * 1.85
    height: root.u * 1.55
    radius: Math.max(0.8, root.u * 0.22)
    color: root.color
  }
}
