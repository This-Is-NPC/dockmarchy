import QtQuick
import QtQuick.Shapes
import qs.Commons

// Compact occupancy dial: a 270° arc, percent in the hub, used/total under
// the label. Sized for a three-up row in the panel, not a cluster overlay.
Item {
  id: root

  property string label: ""
  property string detail: ""
  property real percent: 0
  property bool hot: false
  property color foreground: Color.foreground
  property color fill: Color.accent
  property color hotFill: Color.urgent
  property string fontFamily: Style.font.family

  property real shown: 0

  readonly property real fraction: Math.max(0, Math.min(1, shown / 100))
  readonly property real dialStart: 135
  readonly property real dialSweep: 270
  readonly property real arcWidth: Math.max(3, Style.space(3))
  readonly property real diameter: Math.min(width - Style.space(4), Style.space(68))
  readonly property real arcRadius: Math.max(1, diameter / 2 - arcWidth)
  readonly property color arcColor: hot ? hotFill : fill
  readonly property color trackColor: Util.alpha(foreground, 0.16)

  implicitHeight: column.implicitHeight

  onPercentChanged: shown = percent
  Component.onCompleted: shown = percent

  Behavior on shown {
    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
  }

  Column {
    id: column
    width: parent.width
    spacing: Style.space(2)

    Item {
      id: dial
      width: root.diameter
      height: root.diameter
      anchors.horizontalCenter: parent.horizontalCenter

      Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer

        ShapePath {
          strokeWidth: root.arcWidth
          strokeColor: root.trackColor
          fillColor: "transparent"
          capStyle: ShapePath.RoundCap

          PathAngleArc {
            centerX: dial.width / 2
            centerY: dial.height / 2
            radiusX: root.arcRadius
            radiusY: root.arcRadius
            startAngle: root.dialStart
            sweepAngle: root.dialSweep
          }
        }

        ShapePath {
          strokeWidth: root.arcWidth
          strokeColor: root.fraction > 0.004 ? root.arcColor : "transparent"
          fillColor: "transparent"
          capStyle: ShapePath.RoundCap

          PathAngleArc {
            centerX: dial.width / 2
            centerY: dial.height / 2
            radiusX: root.arcRadius
            radiusY: root.arcRadius
            startAngle: root.dialStart
            sweepAngle: root.dialSweep * root.fraction
          }
        }
      }

      Text {
        anchors.centerIn: parent
        text: {
          var n = root.shown
          if (!isFinite(n) || n <= 0) return "0%"
          if (n > 0 && n < 0.1) return "<0.1%"
          if (Math.abs(n - Math.round(n)) < 0.05) return Math.round(n) + "%"
          return n.toFixed(1) + "%"
        }
        color: root.hot ? root.arcColor : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }

    Text {
      width: parent.width
      text: root.label
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      horizontalAlignment: Text.AlignHCenter
    }

    Text {
      width: parent.width
      text: root.detail
      color: root.hot ? root.arcColor : Qt.darker(root.foreground, 1.55)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.NoWrap
      elide: Text.ElideRight
    }
  }
}
