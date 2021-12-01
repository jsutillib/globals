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
        return p !== null && typeof p === "object" && p.is_proxy !== undefined;
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
        get_proxy_tree(name = null, value = null) {
            if (name === null) {
                for (let prop in this.__target) {
                    if (this.__target[prop] === value) {
                        name = prop;
                        break;
                    }
                }
                if (name === null) {
                    throw new Error(`Could not find the value in the properties of the proxy`);
                }
            } else {}
            if (this.__parent !== null) {
                return [ ...this.__parent.listener.get_proxy_tree(null, this.__proxy), {
                    p: this.__proxy,
                    n: name
                } ];
            } else {
                return [ {
                    p: this.__proxy,
                    n: name
                } ];
            }
        }
        __fire_events(name, value) {
            let proxy_tree = this.get_proxy_tree(name, value);
            let triggerer = proxy_tree.map(x => x.n).join(".");
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: {
                    var: triggerer,
                    value: value
                }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });
            this.notify(proxy_tree);
        }
        notify(proxy_tree, e = null) {
            let var_fqn = proxy_tree.map(x => x.n).join(".");
            let var_name = proxy_tree[proxy_tree.length - 1].n;
            let proxy = this.__proxy;
            proxy_tree.pop();
            let bubblemanager = true;
            if (e === null) {
                e = {
                    target: proxy,
                    type: "change",
                    from: var_fqn,
                    cancelled: false
                };
            } else {
                bubblemanager = false;
            }
            let event = {
                event: e,
                variable: var_name,
                fqvn: var_fqn,
                value: proxy[var_name],
                stopPropagation: function() {
                    e.cancelled = true;
                }
            };
            let subscriptions = this.get_parent_subscriptions();
            for (let k in subscriptions) {
                let subscription = subscriptions[k];
                if (subscription.re.test(var_fqn)) {
                    subscription.callbacks.forEach(function(sub) {
                        if (e.cancelled) {
                            return;
                        }
                        sub.callback.call(proxy, event);
                    });
                    if (bubblemanager && this.__settings.propagatechanges === true) {
                        for (let i = proxy_tree.length; !e.cancelled && i > 0; i--) {
                            let c_proxy = proxy_tree[i - 1].p;
                            c_proxy.listener.notify(proxy_tree, e);
                        }
                    }
                }
                if (e.cancelled) {
                    break;
                }
            }
        }
        addEventListener(type, eventHandler) {
            var listener = {};
            listener.type = type;
            listener.eventHandler = eventHandler;
            this.__event_listeners.push(listener);
        }
        dispatchEvent(event) {
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
        get_parent_subscriptions() {
            if (this.__parent === null) {
                return this.__subscriptions;
            }
            return Object.assign({}, this.__subscriptions, this.__parent.listener.get_parent_subscriptions());
        }
        listen(varnames, event_handler, autocancel = false) {
            if (!Array.isArray(varnames)) {
                varnames = [ varnames ];
            }
            varnames.forEach(function(varname) {
                if (varname === "") {
                    varname = "*";
                }
                if (this.__subscriptions[varname] === undefined) {
                    let re = varname.replace(".", "\\.").replace("*", ".*").replace("?", "[^.]*");
                    re = `^${re}$`;
                    this.__subscriptions[varname] = {
                        re: new RegExp(re),
                        callbacks: []
                    };
                }
                this.__subscriptions[varname].callbacks.push({
                    callback: event_handler,
                    autocancel: autocancel
                });
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
    let WatchedObject = (original = {}, options = {}) => {
        if (original === null) {
            return null;
        }
        if (typeof original !== "object") {
            return original;
        }
        let defaults = {
            propertiesdepth: -1,
            cloneobjects: false,
            propagatechanges: false,
            eventtarget: [ window ],
            eventtype: "watch"
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
        if (settings.propertiesdepth !== 0) {
            let propsettings = settings;
            if (settings.propertiesdepth > 0) {
                propsettings = jsutilslib.merge(settings, {
                    propertiesdepth: settings.propertiesdepth - 1
                });
            }
            function convertproperty(x) {
                let clonedprop = WatchedObject(x, propsettings);
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
                if (is_proxy(value)) {
                    value.listener.__parent = proxy;
                }
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
