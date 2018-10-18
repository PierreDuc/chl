import { NgZone } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { DomEventOptionsPlugin } from './dom-event-options-plugin.service';

import { ErrorMsg } from '../enum/error-msg.enum';
import { EventSeparator } from "../enum/event-separator.enum";
import { GlobalEventTarget } from '../enum/global-event-target.enum';
import { NativeEventOption } from '../enum/native-event-option.enum';
import { OperatorSymbol } from '../enum/operator-symbol.enum';
import { OptionSymbol } from '../enum/option-symbol.enum';

let domEventOptionsPlugin: DomEventOptionsPlugin;
let el: HTMLDivElement;
let ngZone: NgZone;

describe('Dom event options plugin', () => {
  const time: number = 50;
  const noop: EventListener = () => void 0;
  const addEvent = (options: string = '*', element: HTMLElement = el, callback: EventListener = noop, useZone: boolean = true) => {
    if (useZone) {
      return ngZone.run(() => domEventOptionsPlugin.addEventListener(element, `click.${options}`, callback));
    } else {
      return ngZone.runOutsideAngular(() => domEventOptionsPlugin.addEventListener(element, `click.${options}`, callback));
    }
  };
  const addGlobalEvent = (target: GlobalEventTarget, options: string = '*', callback: EventListener = noop): () => void =>
    domEventOptionsPlugin.addGlobalEventListener(target, `click.${options}`, callback);

  const createOperator = (operator: OperatorSymbol, time?: number, immediate?: 0 | 1): string => {
    const timeStr = time == null ? '' : time.toString();
    const immStr = immediate == null ? '' : immediate.toString();
    const operatorVars = timeStr && immStr ? `${timeStr}${EventSeparator.Operator}${immStr}` : timeStr || immStr;
    return `${OptionSymbol.Force}${EventSeparator.Block}${operator}[${operatorVars}]`;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ DomEventOptionsPlugin ] });
    domEventOptionsPlugin = TestBed.get(DomEventOptionsPlugin);
    ngZone = TestBed.get(NgZone);
  });

  it('should have tested for browser supported', () => {
    expect(domEventOptionsPlugin).toBeDefined();
    expect(domEventOptionsPlugin[ 'nativeEventObjectSupported' ]).toBeDefined();
  });

  it('removeEventListener should be called on the element', () => {
    el = document.createElement('div');
    spyOn(el, 'removeEventListener');
    addEvent()();
    expect(el.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('should reuse AddEventListenerObjects for native options regardless of the order of options', () => {
    el = document.createElement('div');

    (domEventOptionsPlugin as any)[ 'nativeOptionsObjects' ] = {};

    addEvent(OptionSymbol.Passive + OptionSymbol.Capture);
    addEvent(OptionSymbol.Capture + OptionSymbol.Passive);
    addEvent(OptionSymbol.Capture + OptionSymbol.NoZone + OptionSymbol.Passive);
    addEvent(OptionSymbol.Passive + OptionSymbol.NoZone);

    expect(Object.keys(domEventOptionsPlugin[ 'nativeOptionsObjects' ]).length).toEqual(2);
  });

  describe('AddEventListener', () => {
    it('should return a function', () => {
      el = document.createElement('div');
      expect(typeof addEvent()).toEqual('function');
    });

    it('should be called on the element', () => {
      el = document.createElement('div');
      spyOn(el, 'addEventListener');
      addEvent();
      expect(el.addEventListener).toHaveBeenCalledTimes(1);
    });

    it('should throw an error on passive, prevent default', () => {
      el = document.createElement('div');
      expect(() => addEvent(OptionSymbol.Passive + OptionSymbol.PreventDefault))
        .toThrowError(ErrorMsg.PassivePreventDefault);
    });
  });

  describe('AddGlobalEventListener', () => {
    it('addGlobalEventListener should return a function', () => {
      expect(typeof addGlobalEvent(GlobalEventTarget.Document)).toEqual('function');
      expect(typeof addGlobalEvent(GlobalEventTarget.Window)).toEqual('function');
      expect(typeof addGlobalEvent(GlobalEventTarget.Body)).toEqual('function');
    });

    it('addGlobalEventListener throw on unknown element name', () => {
      const element: string = 'html';
      const replace: string[] = [ element, `click.${OptionSymbol.Force}` ];
      const error: string = ErrorMsg.UnsupportedEventTarget.replace(/\|~/g, () => replace.shift() as string);

      expect(() => addGlobalEvent(element as any, OptionSymbol.Force)).toThrowError(error);
    });
  });

  describe('Support', () => {
    it('should support only events with a dot and with proper settings', () => {
      expect(domEventOptionsPlugin.supports('click')).toEqual(false);
      expect(domEventOptionsPlugin.supports('test')).toEqual(false);
      expect(domEventOptionsPlugin.supports('click#pcon')).toEqual(false);
      expect(domEventOptionsPlugin.supports('test.')).toEqual(false);
      expect(domEventOptionsPlugin.supports('.')).toEqual(false);
      expect(domEventOptionsPlugin.supports('click.pcon')).toEqual(true);
      expect(domEventOptionsPlugin.supports('mousemove.pp')).toEqual(false);
      expect(domEventOptionsPlugin.supports('mousedown.p')).toEqual(true);
      expect(domEventOptionsPlugin.supports('submit.pconsdb')).toEqual(true);
      expect(domEventOptionsPlugin.supports('keydown.p')).toEqual(false);
      expect(domEventOptionsPlugin.supports('keydown.p*')).toEqual(true);
      expect(domEventOptionsPlugin.supports('foo.pc')).toEqual(true);
      expect(domEventOptionsPlugin.supports(' click. pc ')).toEqual(true);
    });
  });

  describe('Check `Once` option', () => {
    let listener: { listener: EventListener };

    beforeEach(() => {
      el = document.createElement('div');
      listener = { listener: noop };
      spyOn(listener, 'listener');
    });

    const performClickEvent = (options: OptionSymbol = OptionSymbol.Force): void => {
      addEvent(options, el, listener.listener);
      el.click();
      el.click();
    };

    it('should call the callback twice when triggered twice', () => {
      performClickEvent();
      expect(listener.listener).toHaveBeenCalledTimes(2);
    });

    it('should call the callback only once when the `Once` option is used', () => {
      performClickEvent(OptionSymbol.Once);
      expect(listener.listener).toHaveBeenCalledTimes(1);
    });

    it('should call the callback only once even when `Once` is not supported', () => {
      const onceSupported: boolean = domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Once ];
      domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Once ] = false;
      performClickEvent(OptionSymbol.Once);
      expect(listener.listener).toHaveBeenCalledTimes(1);
      domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Once ] = onceSupported;
    });
  });

  describe('Check `NoZone` option', () => {
    it('should be outside the zone when the `NoZone` option is used', async () => {
      el = document.createElement('div');
      const result: boolean = await new Promise<boolean>((resolve) => {
        addEvent(OptionSymbol.NoZone, el, () => resolve(NgZone.isInAngularZone()));
        el.click();
      });

      await expect(result).toEqual(false);
    });

    it('should not call runOutsideAngular when already outside NgZone', () => {
      spyOn<NgZone>(ngZone, 'runOutsideAngular');
      spyOn<NgZone>(ngZone, 'run');
      el = document.createElement('div');
      addEvent(OptionSymbol.NoZone, el, noop, false);
      el.click();

      expect(ngZone.runOutsideAngular).toHaveBeenCalledTimes(1);
      expect(ngZone.run).toHaveBeenCalledTimes(0);
    });

    it('should call runOutsideAngular and run when inside NgZone', () => {
      spyOn<NgZone>(ngZone, 'runOutsideAngular');
      spyOn<NgZone>(ngZone, 'run');
      el = document.createElement('div');
      addEvent();
      el.click();

      expect(ngZone.runOutsideAngular).toHaveBeenCalledTimes(0);
      expect(ngZone.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('Check `PreventDefault` option', () => {
    it('should prevent default behaviour when the `PreventDefault` option is used', async () => {
      el = document.createElement('div');

      const result: boolean = await new Promise<boolean>(resolve => {
        addEvent(OptionSymbol.PreventDefault, el, event => resolve(event.defaultPrevented));
        el.click();
      });

      await expect(result).toEqual(true);
    });
  });

  describe('Check `Stop` option', () => {
    let listeners: { [key: string]: EventListener };

    beforeEach(() => {
      el = document.createElement('div');
      listeners = {
        listener1: () => {
        },
        listener2: () => {
        }
      };
      spyOn(listeners, 'listener1');
      spyOn(listeners, 'listener2');
    });

    it('should stop the immediate propagation of an event', () => {
      addEvent(OptionSymbol.Stop, el, listeners.listener1);
      addEvent(OptionSymbol.Force, el, listeners.listener2);

      el.click();

      expect(listeners.listener1).toHaveBeenCalledTimes(1);
      expect(listeners.listener2).toHaveBeenCalledTimes(0);
    });

    it('should stop the propagation to a parent', () => {
      const parent: HTMLDivElement = document.createElement('div');
      parent.appendChild(el);

      addEvent(OptionSymbol.Force, parent, listeners.listener2);
      addEvent(OptionSymbol.Stop, el, listeners.listener1);
      addEvent(OptionSymbol.Force, parent, listeners.listener1);

      el.click();

      expect(listeners.listener1).toHaveBeenCalledTimes(1);
      expect(listeners.listener2).toHaveBeenCalledTimes(0);
    });

    it('should work without actually having a listener', () => {
      addEvent(OptionSymbol.Stop, el, null as any);
      addEvent(OptionSymbol.Force, el, listeners.listener2);

      el.click();

      expect(listeners.listener1).toHaveBeenCalledTimes(0);
      expect(listeners.listener2).toHaveBeenCalledTimes(0);
    });
  });

  describe('Check `Capture` option', () => {
    let parent: HTMLDivElement;
    let childVisited: boolean;
    let inCapture: boolean;

    beforeEach(() => {
      parent = document.createElement('div');
      el = document.createElement('div');
      parent.appendChild(el);

      childVisited = false;
      inCapture = false;
    });

    it('should create an event triggered in the capture phase', async () => {
      const result: boolean = await new Promise<boolean>(resolve => {
        addEvent(OptionSymbol.Capture, parent, () => inCapture = !childVisited);
        addEvent(OptionSymbol.Force, parent, () => resolve(childVisited && inCapture));
        addEvent(OptionSymbol.Force, el, () => childVisited = true);
        el.click();
      });

      await expect(result).toEqual(true);
    });

    it('should create an event triggered in the capture phase when there is no native event object support', async () => {
      const nativeSupported: boolean = domEventOptionsPlugin[ 'nativeEventObjectSupported' ] as boolean;
      domEventOptionsPlugin[ 'nativeEventObjectSupported' ] = false;

      const result: boolean = await new Promise<boolean>(resolve => {
        addEvent(OptionSymbol.Capture, parent, () => inCapture = !childVisited);
        addEvent(OptionSymbol.Force, parent, () => resolve(childVisited && inCapture));
        addEvent(OptionSymbol.Force, el, () => childVisited = true);
        el.click();
      });

      await expect(result).toEqual(true);
      domEventOptionsPlugin[ 'nativeEventObjectSupported' ] = nativeSupported;
    });
  });

  describe('Check `Passive` option', () => {
    it('should not set defaultPrevented on true when calling preventDefault on the event', async () => {
      el = document.createElement('div');

      const result: boolean = await new Promise<boolean>(resolve => {
        addEvent(OptionSymbol.Passive, el, event => {
          event.preventDefault();
          resolve(event.defaultPrevented);
        });
        el.click();
      });

      await expect(result).toEqual(false);
    });

    it('should not create a passive event when passive is not supported', async () => {
      const nativeEventObjectSupported: boolean = domEventOptionsPlugin[ 'nativeEventObjectSupported' ] as boolean;
      const passiveSupported: boolean = domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Passive ];
      domEventOptionsPlugin[ 'nativeEventObjectSupported' ] = false;
      domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Passive ] = false;

      el = document.createElement('div');

      const result: boolean = await new Promise<boolean>(resolve => {
        addEvent(OptionSymbol.Passive, el, event => {
          event.preventDefault();
          resolve(event.defaultPrevented);
        });
        el.click();
      });

      await expect(result).toEqual(true);
      domEventOptionsPlugin[ 'nativeEventObjectSupported' ] = nativeEventObjectSupported;
      domEventOptionsPlugin[ 'nativeOptionsSupported' ][ NativeEventOption.Passive ] = passiveSupported;
    });
  });

  describe('Check `InBrowser` option', () => {
    let listener: { listener: EventListener };

    beforeEach(() => {
      el = document.createElement('div');
      listener = {listener: noop};
      spyOn(listener, 'listener');
    });

    it('should call the listener when inside a browser environment', () => {
      addEvent(OptionSymbol.InBrowser, el, listener.listener);
      el.click();
      expect(listener.listener).toHaveBeenCalledTimes(1);
    });

    it('should not call the listener when inside a non browser environment', () => {
      const platformId: Object = domEventOptionsPlugin['platformId'];
      (domEventOptionsPlugin as any).platformId = 'non-browser';

      const callback1: () => void = addEvent(OptionSymbol.InBrowser, el, listener.listener);
      const callback2: () => void = addGlobalEvent(GlobalEventTarget.Window, OptionSymbol.InBrowser, listener.listener);
      el.click();

      expect(typeof callback1).toEqual('function');
      expect(typeof callback2).toEqual('function');
      expect(listener.listener).toHaveBeenCalledTimes(0);

      callback1();
      callback2();

      (domEventOptionsPlugin as any).platformId = platformId;
    });
  });

  describe('Check `Throttle` operator', () => {
    let listener: { listener: EventListener };
    let callCount: number = 0;

    beforeEach(() => {
      el = document.createElement('div');
      callCount = 0;
      listener = { listener: () =>  {
        callCount = callCount + 1;
      }};
    });

    const checkThrottle = (immediate: 0 | 1 = 0) => {
      for (let i = 0; i < time; i++) {
        el.click();

        if (i === 0) {
          expect(callCount).toEqual(immediate);
        }

        tick(time / 10);
      }

      tick(time);

      expect(callCount).toBeLessThanOrEqual(time / 10 + 1);
      expect(callCount).toBeGreaterThanOrEqual(time / 10 - 1);
    };

    it('should throttle the event', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Throttle, time, 0), el, listener.listener);
      checkThrottle(0);
    }));

    it('should throttle the event and call immediate', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Throttle, time, 1), el, listener.listener);
      checkThrottle(1);
    }));

    it('should throttle with no time and no immediate', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Throttle), el, listener.listener);
      checkThrottle(0);
    }));

    it('should throttle with just time', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Throttle, time), el, listener.listener);
      checkThrottle(0);
    }));
  });

  describe('Check `Debounce` operator', () => {
    let listener: { listener: EventListener };

    beforeEach(() => {
      el = document.createElement('div');
      listener = { listener: noop };
      spyOn(listener, 'listener');
    });

    const checkDebounce = (immediate: 0 | 1 = 0) => {
      for (let i = 0; i < time; i++) {
        el.click();

        if (i === 0) {
          expect(listener.listener).toHaveBeenCalledTimes(immediate);
        }

        tick(time / 10);
      }

      tick(time);
      expect(listener.listener).toHaveBeenCalledTimes(1);
    };

    it('should debounce the event', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Debounce, time, 0), el, listener.listener);
      checkDebounce(0);
    }));

    it('should debounce the event and call immediate', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Debounce, time, 1), el, listener.listener);
      checkDebounce(1);
    }));

    it('should debounce with no time and no immediate', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Debounce), el, listener.listener);
      checkDebounce(0);
    }));

    it('should debounce with just time', fakeAsync(() => {
      addEvent(createOperator(OperatorSymbol.Debounce, time), el, listener.listener);
      checkDebounce(0);
    }));
  });
});
