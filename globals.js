/**
   Copyright 2021 Carlos A. (https://github.com/dealfonso)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

(function(exports, document) {
    "use strict";
    if (exports.jsutils === undefined) {
        exports.jsutils = {};
    }
    function is_proxy(p) {
        return typeof p === "object" && p.is_proxy === true;
    }
    class ListenerController {
        static subscriptions = {};
        constructor(proxy, target, settings) {
            this.__proxy = proxy;
            this.__target = target;
            this.__settings = Object.assign({}, settings);
            this.__event_listeners = [];
            this.__parent = null;
        }
        __fire_events(name, value, suffix = "") {
            if (is_proxy(name)) {
                for (let prop in this.__target) {
                    if (this.__target[prop] === name) {
                        name = prop;
                        value = this.__proxy[prop];
                    }
                }
            }
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: {
                    name: name,
                    value: value
                }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });
            let varname = name;
            if (this.__parent !== null) {
                varname = this.__parent.listener.__fire_events(this.__proxy, undefined, `.${name}${suffix}`);
                varname = `${varname}.${name}`;
            }
            this.notify(varname, value, `${name}${suffix}`);
            return varname;
        }
        addEventListener(type, eventHandler) {
            var listener = {};
            listener.type = type;
            listener.eventHandler = eventHandler;
            this.__event_listeners.push(listener);
        }
        dispatchEvent(event) {
            if (event.cancelBubble) {
                return;
            }
            this.__event_listeners.forEach(listener => {
                if (listener.type === event.type) {
                    listener.eventHandler(event);
                }
            });
        }
        removeEventListener(type, eventHandler) {
            this.__event_listeners = this.__event_listeners.filter(listener => {
                return listener.type !== type || listener.eventHandler !== eventHandler;
            });
        }
        notify(varname, value, from) {
            for (let k in ListenerController.subscriptions) {
                let subscription = ListenerController.subscriptions[k];
                if (subscription.re.test(varname)) {
                    subscription.callbacks.forEach(sub => {
                        sub(varname, value, from);
                    });
                }
            }
        }
        listen(varnames, eventHandler) {
            if (!Array.isArray(varnames)) {
                varnames = [ varnames ];
            }
            varnames.forEach(function(varname) {
                if (ListenerController.subscriptions[varname] === undefined) {
                    let re = varname.replace(".", "\\.").replace("*", ".*").replace("?", "[^.]*");
                    re = `^${re}$`;
                    ListenerController.subscriptions[varname] = {
                        re: new RegExp(re),
                        callbacks: []
                    };
                }
                ListenerController.subscriptions[varname].callbacks.push(eventHandler);
            });
        }
        unlisten(varname, eventHandler) {
            if (ListenerController.subscriptions[varname] === undefined) {
                return;
            }
            ListenerController.subscriptions[varname].callbacks.filter(function(e) {
                return e !== eventHandler;
            });
        }
    }
    let VariableListener = (original, options = {}) => {
        let defaults = {
            listenonchildren: true,
            eventtarget: [ window ],
            eventtype: "update-variable",
            cloneobjects: false,
            convertproperties: true
        };
        let settings = jsutils.merge(defaults, options);
        if (!Array.isArray(settings.eventtarget)) {
            settings.eventtarget = [ settings.eventtarget ];
        }
        function convertobject(value, settings) {
            if (typeof value === "object") {
                let children = [];
                if (settings.convertproperties) {
                    let tranformfnc = x => x;
                    if (settings.cloneobjects) {
                        tranformfnc = jsutils.clone;
                    }
                    value = jsutils.processprops(value, function(x) {
                        let mychildren = [];
                        if (Array.isArray(x)) {
                            x = x.map(y => VariableListener(tranformfnc(y), settings));
                            x.forEach(y => mychildren.push(y.listener));
                        }
                        let clonedprop = convertobject(tranformfnc(x), settings);
                        if (clonedprop.is_proxy !== undefined) children.push(clonedprop.listener);
                        mychildren.forEach(child => {
                            child.__parent = clonedprop;
                        });
                        return clonedprop;
                    }, settings.cloneobjects);
                }
                value = VariableListener(value, settings);
                value.listener.__parent = proxy;
                children.forEach(child => {
                    child.__parent = value;
                });
            } else {}
            return value;
        }
        let listener = null;
        let proxy = new Proxy(original, {
            get(target, name, receiver) {
                if (listener === null) {
                    listener = new ListenerController(proxy, target, settings);
                }
                switch (name) {
                  case "is_proxy":
                    return true;

                  case "listener":
                    return listener;

                  case "value":
                    return function() {
                        return jsutils.clone(target, function(x) {
                            if (is_proxy(x)) {
                                return x.object();
                            }
                            return x;
                        });
                    };

                  case "object":
                    return function() {
                        return target;
                    };
                }
                if ([ "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent" ].includes(name)) {
                    return listener[name].bind(listener);
                }
                let rv = Reflect.get(target, name, receiver);
                return rv;
            },
            set(target, name, value, receiver) {
                if (listener === null) {
                    listener = new ListenerController(proxy, target, settings);
                }
                let reserved = [ "value", "listener", "is_proxy", "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent" ].includes(name);
                if (reserved) {
                    throw new Exception("invalid keyword");
                }
                if (settings.listenonchildren) {
                    value = convertobject(value, settings);
                }
                let retval = Reflect.set(target, name, value, receiver);
                listener.__fire_events(name, value);
                return retval;
            }
        });
        return proxy;
    };
    exports._GLOBALS = VariableListener({});
    exports.jsutils.VariableListener = VariableListener;
})(window, document);
