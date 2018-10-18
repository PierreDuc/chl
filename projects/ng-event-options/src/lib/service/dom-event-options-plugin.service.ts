import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

import { ErrorMsg } from '../enum/error-msg.enum';
import { EventOption } from '../enum/event-option.enum';
import { GlobalEventTarget } from '../enum/global-event-target.enum';
import { NativeEventOption } from '../enum/native-event-option.enum';
import { OperatorSymbol } from '../enum/operator-symbol.enum';
import { OptionSymbol } from '../enum/option-symbol.enum';

import { EventOptionsObject } from '../type/event-options-object';

import { EventTypeOptions } from "../interface/event-type-options.interface";

import { getBitValue } from '../helper/get-bit-value';
import { throttleEvent } from '../helper/throttle-event';
import { debounceEvent } from '../helper/debounce-event';
import {EventSeparator} from "../enum/event-separator.enum";

@Injectable()
// EventManagerPlugin is not yet part of the public API of Angular, once it is I can remove the `addGlobalEventListener`
export class DomEventOptionsPlugin /*extends EventManagerPlugin*/ {

  private nativeEventObjectSupported?: boolean;

  private readonly nativeOptionsObjects: { [key: number]: AddEventListenerOptions } = {};

  private readonly nativeOptionsSupported: { [O in NativeEventOption]: boolean } = {
    capture: false,
    once: false,
    passive: false
  };

  private readonly keyEvents: (keyof DocumentEventMap)[] = [ 'keydown', 'keypress', 'keyup' ];

  private readonly operatorSymbols: OperatorSymbol[] = Object.values(OperatorSymbol);

  private readonly supportPattern = new RegExp(`^(?!.*(.).*\\1)[${Object.values(OptionSymbol).join('')}]+$`);

  constructor(private readonly ngZone: NgZone,
              @Inject(DOCUMENT) private readonly doc: any,
              @Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.checkSupport();
  }

  addEventListener(element: HTMLElement, eventName: string, listener: EventListener): () => void {
    const { type, options, operators }: EventTypeOptions = this.getTypeOptions(eventName);
    const inBrowser: number = options.includes(OptionSymbol.InBrowser) ? EventOption.InBrowser : 0;

    if (inBrowser && !isPlatformBrowser(this.platformId)) {
      return (): void => void 0;
    }

    if (typeof listener !== 'function') {
      listener = () => void 0;
    }

    const passive: number = options.includes(OptionSymbol.Passive) ? EventOption.Passive : 0;
    const preventDefault: number = options.includes(OptionSymbol.PreventDefault) ? EventOption.PreventDefault : 0;

    if (passive && preventDefault) {
      throw new Error(ErrorMsg.PassivePreventDefault);
    }

    const stop: number = options.includes(OptionSymbol.Stop) ? EventOption.Stop : 0;
    const once: number = options.includes(OptionSymbol.Once) ? EventOption.Once : 0;
    const noZone: number = options.includes(OptionSymbol.NoZone) ? EventOption.NoZone : 0;
    const capture: number = options.includes(OptionSymbol.Capture) ? EventOption.Capture : 0;

    const operatorSettings: Partial<{ [OS in OperatorSymbol]: string[]}> = this.parseOperators(operators);

    const debounceParams: string[] | undefined = operatorSettings[ OperatorSymbol.Debounce ];
    const throttleParams: string[] | undefined = operatorSettings[ OperatorSymbol.Throttle ];

    const bitVal: number = getBitValue(capture, once, passive);
    const eventOptionsObj: EventOptionsObject = this.getEventOptionsObject(bitVal);
    const inZone: boolean = NgZone.isInAngularZone();

    const callback: EventListener = (event: Event) => {
      if (noZone || !inZone) {
        listener(event);
      } else {
        this.ngZone.run((): void => listener(event));
      }
    };

    let debounceCallback: EventListener;
    let throttleCallback: EventListener;

    if (debounceParams) {
      debounceCallback = debounceEvent(callback, ...debounceParams.map(p => +p));
    }

    if (throttleParams) {
      throttleCallback = throttleEvent(callback, ...throttleParams.map(p => +p));
    }

    const intermediateListener: EventListener = (event: Event): void => {
      if (stop) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      if (preventDefault) {
        event.preventDefault();
      }

      if (once && !this.nativeOptionsSupported[ NativeEventOption.Once ]) {
        element.removeEventListener(type, intermediateListener, eventOptionsObj);
      }

      if (debounceCallback) {
        debounceCallback(event);
      } else if (throttleCallback) {
        throttleCallback(event);
      } else {
        callback(event);
      }
    };

    if (inZone) {
      this.ngZone.runOutsideAngular((): void =>
        element.addEventListener(type, intermediateListener, eventOptionsObj)
      );
    } else {
      element.addEventListener(type, intermediateListener, eventOptionsObj);
    }

    return () => this.ngZone.runOutsideAngular((): void =>
      element.removeEventListener(type, intermediateListener, eventOptionsObj)
    );
  }

  addGlobalEventListener(element: GlobalEventTarget, eventName: string, listener: EventListener): () => void {
    if (!isPlatformBrowser(this.platformId)) {
      return (): void => void 0;
    }

    let target: EventTarget | undefined;

    if (element === GlobalEventTarget.Window) {
      target = window;
    } else if (element === GlobalEventTarget.Document) {
      target = this.doc;
    } else if (element === GlobalEventTarget.Body && this.doc) {
      target = this.doc.body;
    } else {
      const replace: string[] = [ element, eventName ];
      throw new Error(ErrorMsg.UnsupportedEventTarget.replace(/\|~/g, () => replace.shift() as string));
    }

    return this.addEventListener(target as HTMLElement, eventName, listener);
  }

  supports(eventName: string): boolean {
    const { type, options }: EventTypeOptions = this.getTypeOptions(eventName);

    // if no event type is found
    if (!type) {
      return false;
    }

    // if it's a key event it needs to have more than one option for support
    if (options.length === 1 && this.keyEvents.includes(type as keyof DocumentEventMap)) {
      return false;
    }

    return !!options.match(this.supportPattern);
  }

  private checkSupport(): void {
    const supportObj: object = new Object(null);

    Object.keys(NativeEventOption).map(optionKey => NativeEventOption[ optionKey as any ]).forEach(nativeOption =>
      Object.defineProperty(supportObj, nativeOption, {
        get: () => {
          this.nativeOptionsSupported[ nativeOption as NativeEventOption ] = true;
        }
      })
    );

    try {
      window.addEventListener('test', new Function as EventListener, supportObj);
    } catch {
    }

    this.nativeEventObjectSupported = this.nativeOptionsSupported[ NativeEventOption.Capture ];
  }

  private parseOperators(operatorsStr: string): Partial<{ [OS in OperatorSymbol]: string[]}> {
    const operators: Partial<{ [OS in OperatorSymbol]: string[]}> = {};

    if (operatorsStr) {
      operatorsStr.split(/],?/).forEach(operatorStr => {
        const parts: string[] = operatorStr.split('[');
        if (parts.length === 2) {
          const operator: OperatorSymbol = parts[ 0 ] as OperatorSymbol;
          if (operator && this.operatorSymbols.indexOf(operator) > -1) {
            operators[ operator ] = parts[ 1 ].split(EventSeparator.Operator).filter(p => p);
          }
        }
      });
    }

    return operators;
  }

  private getEventOptionsObject(options: number): EventOptionsObject {
    if (!this.nativeEventObjectSupported) {
      return (options & EventOption.Capture) === EventOption.Capture;
    }

    const eventOptions: number = (options & EventOption.Capture) + (options & EventOption.Passive) + (options & EventOption.Once);

    if (eventOptions in this.nativeOptionsObjects) {
      return this.nativeOptionsObjects[ eventOptions ];
    }

    const optionsObj: EventOptionsObject = {
      capture: !!(eventOptions & EventOption.Capture),
      passive: !!(eventOptions & EventOption.Passive),
      once: !!(eventOptions & EventOption.Once)
    };

    this.nativeOptionsObjects[ eventOptions ] = optionsObj;

    return optionsObj;
  }

  private getTypeOptions(eventName: string): EventTypeOptions {
    let [ type, options, operators ]: string[] = eventName.split(EventSeparator.Option);

    if (!options || !type) {
      return { type: '', options: '', operators: '' };
    }

    [ options, operators ] = options.split(EventSeparator.Block);

    if (!operators) {
      operators = '';
    }

    type = type.trim();
    options = options.trim();
    operators = operators.trim();

    return { type, options, operators };
  }
}
