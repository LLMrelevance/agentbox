// Neo's ⌘ listener. Reports when ⌘ goes down or up, when any other modifier
// changes, when any other key goes down, and when a mouse button goes down,
// one line each on stdout: "<kind> <ms>". It never reports which key, never
// what is typed, and never changes an event (listen-only tap). Whether the
// presses make a double tap is decided in shared/neo-double-tap.mjs.
//
// Needs macOS Input Monitoring. Without it, it asks once and prints
// "no-permission" before exiting.
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

if !CGPreflightListenEventAccess() {
  _ = CGRequestListenEventAccess()
  print("no-permission")
  exit(2)
}

let otherModifiers: CGEventFlags = [.maskShift, .maskControl, .maskAlternate, .maskSecondaryFn, .maskAlphaShift]
var commandDown = false
var lastOthers = CGEventFlags()
// macOS turns a tap off if it is slow or on some secure input; it is turned
// straight back on, or ⌘⌘ would quietly stop working with the helper alive.
var tapRef: CFMachPort?

func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

let mask: CGEventMask =
  (1 << CGEventType.flagsChanged.rawValue) |
  (1 << CGEventType.keyDown.rawValue) |
  (1 << CGEventType.leftMouseDown.rawValue) |
  (1 << CGEventType.rightMouseDown.rawValue) |
  (1 << CGEventType.otherMouseDown.rawValue)

let callback: CGEventTapCallBack = { _, type, event, _ in
  switch type {
  case .flagsChanged:
    let flags = event.flags
    let others = flags.intersection(otherModifiers)
    if others != lastOthers { lastOthers = others; print("modifier \(now())") }
    let cmd = flags.contains(.maskCommand)
    if cmd != commandDown { commandDown = cmd; print(cmd ? "cmd-down \(now())" : "cmd-up \(now())") }
  case .keyDown:
    print("other \(now())")
  case .leftMouseDown, .rightMouseDown, .otherMouseDown:
    print("mouse \(now())")
  case .tapDisabledByTimeout, .tapDisabledByUserInput:
    print("tap-off \(now())")
    if let t = tapRef { CGEvent.tapEnable(tap: t, enable: true) }
  default:
    break
  }
  return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                                  eventsOfInterest: mask, callback: callback, userInfo: nil) else {
  print("no-permission")
  exit(2)
}
tapRef = tap
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
print("ready \(now())")
CFRunLoopRun()
