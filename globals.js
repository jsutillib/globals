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

(function(exports) {
    "use strict";
    if (exports.jsutilslib === undefined) {
        exports.jsutilslib = {};
    }
    function is_proxy(p) {
        return typeof p === "object" && p.is_proxy !== undefined;
    }
    class ListenerController {
        constructor(settings, subscriptions) {
            this.__subscriptions = subscriptions;
            this.__settings = Object.assign({}, settings);
            this.__event_listeners = [];
            this.__parent = null;
        }
        set_proxy(proxy, target) {
            this.__proxy = proxy;
            this.__target = target;
        }
        __fire_events(name, value, suffix = "") {
            if (this.__proxy === null) {
                return false;
            }
            if (is_proxy(name)) {
                for (let prop in this.__target) {
                    if (this.__target[prop] === name) {
                        name = prop;
                        value = this.__proxy[prop];
                    }
                }
            }
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
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: {
                    varname: varname,
                    value: value,
                    from: from
                }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });
            let subscriptions = this.get_parent_subscriptions();
            if (!e.cancelBubble) {
                for (let k in subscriptions) {
                    let subscription = subscriptions[k];
                    if (subscription.re.test(varname)) {
                        subscription.callbacks.forEach(sub => {
                            sub(varname, value, from);
                        });
                    }
                }
            }
        }
        get_parent_subscriptions() {
            if (this.__parent === null) {
                return this.__subscriptions;
            }
            return Object.assign({}, this.__subscriptions, this.__parent.listener.get_parent_subscriptions());
        }
        listen(varnames, eventHandler) {
            if (!Array.isArray(varnames)) {
                varnames = [ varnames ];
            }
            varnames.forEach(function(varname) {
                if (this.__subscriptions[varname] === undefined) {
                    let re = varname.replace(".", "\\.").replace("*", ".*").replace("?", "[^.]*");
                    re = `^${re}$`;
                    this.__subscriptions[varname] = {
                        re: new RegExp(re),
                        callbacks: []
                    };
                }
                this.__subscriptions[varname].callbacks.push(eventHandler);
            }.bind(this));
        }
        unlisten(varname, eventHandler) {
            if (this.__subscriptions[varname] === undefined) {
                return;
            }
            this.__subscriptions[varname].callbacks.filter(function(e) {
                return e !== eventHandler;
            });
        }
    }
    let WatchedObject = (original, options = {}) => {
        if (typeof original !== "object") {
            return original;
        }
        let defaults = {
            propertiesdepth: 0,
            listenonchildren: true,
            eventtarget: [ window ],
            eventtype: "watch",
            cloneobjects: false,
            convertproperties: true
        };
        let settings = jsutilslib.merge(defaults, options);
        if (!Array.isArray(settings.eventtarget)) {
            settings.eventtarget = [ settings.eventtarget ];
        }
        let subscriptions = {};
        let listener = new ListenerController(settings, subscriptions);
        let children = [];
        if (settings.cloneobjects) {
            original = jsutilslib.clone(original);
        }
        if (settings.listenonchildren) {
            function convertproperty(x) {
                let clonedprop = WatchedObject(x, settings);
                if (clonedprop.is_proxy !== undefined) children.push(clonedprop.listener);
                return clonedprop;
            }
            if (Array.isArray(original)) {
                original = original.map(convertproperty);
            } else {
                jsutilslib.processprops(original, convertproperty);
            }
        }
        let proxy = new Proxy(original, {
            get(target, name, receiver) {
                listener.set_proxy(proxy, target);
                switch (name) {
                  case "is_proxy":
                    return true;

                  case "listener":
                    return listener;

                  case "value":
                    return function() {
                        return jsutilslib.clone(target, function(x) {
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
                listener.set_proxy(proxy, target);
                let reserved = [ "value", "listener", "is_proxy", "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent" ].includes(name);
                if (reserved) {
                    throw new Exception("invalid keyword");
                }
                value = WatchedObject(value, settings);
                let retval = Reflect.set(target, name, value, receiver);
                listener.__fire_events(name, value);
                return retval;
            }
        });
        children.forEach(child => {
            child.__parent = proxy;
        });
        return proxy;
    };
    exports.$watched = WatchedObject({});
    exports.jsutilslib.WatchedObject = WatchedObject;
})(window);
