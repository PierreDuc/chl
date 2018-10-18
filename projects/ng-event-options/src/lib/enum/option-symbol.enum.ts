export enum OptionSymbol {
  Capture = 'c',          // fire event in capture phase
  NoZone = 'n',           // listen and fire outside of the angular zone
  Passive = 'p',          // create a passive event listener
  Stop = 's',             // stop event from bubbling
  Once = 'o',             // remove event listener after first invocation
  PreventDefault = 'd',   // prevent default browser behaviour
  InBrowser = 'b',        // only add listener if current environment is the browser
  Force = '*'             // force usage of ng-event-options
}
