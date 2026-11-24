import AppKit

// The Finder window is 660 × 400 points. Draw at exactly that pixel size
// regardless of the release Mac's display scaling.
let width = 660
let height = 400
guard CommandLine.arguments.count == 2,
      let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width,
        pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Cannot create installer background")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(calibratedWhite: 0.93, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height))).fill()

// The icon centres are x=180 and x=480, y=170 from the top.
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 286, y: 230))
arrow.line(to: NSPoint(x: 374, y: 230))
arrow.move(to: NSPoint(x: 357, y: 247))
arrow.line(to: NSPoint(x: 374, y: 230))
arrow.line(to: NSPoint(x: 357, y: 213))
arrow.lineWidth = 3
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
NSColor(calibratedWhite: 0.42, alpha: 1).setStroke()
arrow.stroke()

let instruction = "Drag Clutter to Applications" as NSString
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 16, weight: .medium),
    .foregroundColor: NSColor(calibratedWhite: 0.28, alpha: 1)
]
let size = instruction.size(withAttributes: attributes)
instruction.draw(at: NSPoint(x: (CGFloat(width) - size.width) / 2, y: 75), withAttributes: attributes)
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Cannot encode installer background")
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
