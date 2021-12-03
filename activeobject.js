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
    class WatchController {
        constructor(settings, subscriptions) {
            this.__subscriptions = subscriptions;
            this.__settings = Object.assign({}, settings);
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
                return [ ...this.__parent.watcher.get_proxy_tree(null, this.__proxy), {
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
            if (this.__target.__proto__[name] !== undefined) {
                return;
            }
            let proxy_tree = this.get_proxy_tree(name, value);
            this.notify(proxy_tree);
        }
        notify(proxy_tree, e = null) {
            let var_fqn = proxy_tree.map(x => x.n).join(".");
            let var_name = proxy_tree[proxy_tree.length - 1].n;
            let proxy = this.__proxy;
            proxy_tree.pop();
            let havetonotifyparents = true;
            if (e === null) {
                e = {
                    target: proxy,
                    type: "change",
                    from: var_fqn,
                    cancelled: false
                };
            } else {
                havetonotifyparents = false;
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
                }
                if (e.cancelled) {
                    break;
                }
            }
            if (havetonotifyparents && this.__settings.propagatechanges === true) {
                for (let i = proxy_tree.length; !e.cancelled && i > 0; i--) {
                    let c_proxy = proxy_tree[i - 1].p;
                    c_proxy.watcher.notify(proxy_tree, e);
                }
            }
        }
        get_parent_subscriptions() {
            if (this.__parent === null) {
                return this.__subscriptions;
            }
            return Object.assign({}, this.__subscriptions, this.__parent.watcher.get_parent_subscriptions());
        }
        watch(varnames, event_handler, autocancel = false) {
            if (!Array.isArray(varnames)) {
                varnames = [ varnames ];
            }
            varnames.forEach(function(varname) {
                if (varname === "") {
                    varname = "*";
                }
                if (this.__subscriptions[varname] === undefined) {
                    let re = varname.replaceAll(".", "\\.").replaceAll("*", ".*").replaceAll("?", "[^.]*");
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
        unwatch(varname, eventHandler = null) {
            if (this.__subscriptions[varname] === undefined) {
                return;
            }
            if (eventHandler === null) {
                this.__subscriptions[varname].callbacks = [];
            } else {
                this.__subscriptions[varname].callbacks.filter(function(e) {
                    return e !== eventHandler;
                });
            }
        }
        set_settings(settings) {
            this.__settings = settings;
        }
    }
    let ActiveObject = (original = {}, options = {}) => {
        if (original === null) {
            return null;
        }
        if (typeof original !== "object") {
            return original;
        }
        let defaults = {
            propertiesdepth: -1,
            cloneobjects: false,
            propagatechanges: false
        };
        let settings = jsutilslib.merge(defaults, options);
        let subscriptions = {};
        let watcher = new WatchController(settings, subscriptions);
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
                let clonedprop = ActiveObject(x, propsettings);
                if (clonedprop.is_proxy !== undefined) children.push(clonedprop.watcher);
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
                watcher.set_proxy(proxy, target);
                switch (name) {
                  case "is_proxy":
                    return true;

                  case "watcher":
                    return watcher;

                  case "value":
                    return function() {
                        return jsutilslib.clone(target, function(x) {
                            if (is_proxy(x)) {
                                return x.object();
                            }
                            return x;
                        });
                    };

                  case "reconfigure":
                    return function(options, reconfigurechildren = true) {
                        settings = jsutilslib.merge(settings, options);
                        watcher.set_settings(settings);
                        if (reconfigurechildren) {
                            for (let p in target) {
                                if (is_proxy(target[p])) {
                                    target[p].reconfigure(options, reconfigurechildren);
                                }
                            }
                        }
                    };

                  case "object":
                    return function() {
                        return target;
                    };

                  case "settings":
                    return jsutilslib.clone(settings);
                }
                if ([ "watch", "unwatch" ].includes(name)) {
                    return watcher[name].bind(watcher);
                }
                let rv = Reflect.get(target, name, receiver);
                return rv;
            },
            set(target, name, value, receiver) {
                watcher.set_proxy(proxy, target);
                let reserved = [ "value", "watcher", "is_proxy", "watch", "unwatch" ].includes(name);
                if (reserved) {
                    throw new Exception("invalid keyword");
                }
                value = ActiveObject(value, settings);
                if (is_proxy(value)) {
                    value.watcher.__parent = proxy;
                }
                let retval = Reflect.set(target, name, value, receiver);
                watcher.__fire_events(name, value);
                return retval;
            }
        });
        children.forEach(child => {
            child.__parent = proxy;
        });
        return proxy;
    };
    exports.$watched = ActiveObject({});
    exports.jsutilslib.ActiveObject = ActiveObject;
    exports.jsutilslib.is_proxy = is_proxy;
})(window);
