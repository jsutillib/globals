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
    if (exports.jsutillib === undefined) {
        exports.jsutillib = {};
    }

    function is_proxy(p) {
        return (typeof p === 'object') && (p.is_proxy === true);
    }

    /**
     * This is a class used to manage the events for the proxy objects. This should be a private class that should not be used directly
     */
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
            // If the name is a proxy instead of a variable, we'll try to get which one is it
            //   ** this is a workaround for internal purposes
            if (is_proxy(name)) {
                for (let prop in this.__target) {
                    if (this.__target[prop] === name) {
                        name = prop;
                        value = this.__proxy[prop];
                    }
                }
            }
            /*
            if (is_proxy(value)) {
                value = value.object();
            }
            */
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: { name, value }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });

            // Now we'll get the FQN of the variable and fire the events for it
            //let vartree = `${name}${suffix}`;
            let varname = name;

            // The idea is to fire the events from the top-level proxy, so if this proxy has a parent, we'll wait until the parent is done and returns
            //   the whole FQN; then the FQN of this
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
            // TODO: support for listening for variables that are not created, yet
            //   e.g. listen to pdf.pages[0].text, but pdf.pages is not set yet; then, when it is set, fire the events
            // This is important because if we watch (e.g. pdf.pages.text), then set pdf.pages to 0 and then pdf.pages to
            //   a new object that contains "text" as a property, in the actual state, the listener will be lost because
            //   it was watching the old object, and not the new one.
            if (! Array.isArray(varnames)) {
                varnames = [varnames];
            }
            varnames.forEach(function (varname) {
                if (ListenerController.subscriptions[varname] === undefined) {

                    let re = varname.replace(".", "\\.").replace("*", ".*").replace("?", "[^.]*");
                    re = `^${re}$`

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

    /** Original snip of code from https://stackoverflow.com/a/69459844/14699733 */
    let WatchedVariable = (original, options = {}) => {
        let defaults = {
            listenonchildren: true,
            eventtarget: [ window ],
            eventtype: 'update-variable',
            cloneobjects: false,
            convertproperties: true
        };
        let settings = jsutillib.merge(defaults, options);
        if (!Array.isArray(settings.eventtarget)) {
            settings.eventtarget = [ settings.eventtarget ];
        }
        function convertobject(value, settings) {
            if (typeof value === "object") {
                let children = [];

                if (settings.convertproperties) {
                    let tranformfnc = (x) => x;
                    if (settings.cloneobjects) {
                        // We'll clone the value, because we just don't want to modify the original object nor
                        //   getting the properties of the watched object modified because of modifying the original 
                        //   object (e.g. j = {a:'a',b:'b'}; _GLOBALS.j = j; j.a = 'c'; would cause _GLOBALS.j.a to 
                        //   be 'c' but we did not catch the modification).
                        // Instead, we clone the object and use the clone as the watched object.
                        tranformfnc = jsutillib.clone;
                    }

                    value = jsutillib.processprops(value, function(x) {
                        // TODO: not sure what to do with objects that are proxies (cloning or not)

                        // If it is an array, we'll need to convert each of the elements of the array
                        let mychildren = [];
                        if (Array.isArray(x)) {
                            x = x.map((y) => WatchedVariable(tranformfnc(y), settings));
                            x.forEach(y => mychildren.push(y.listener));
                        }

                        let clonedprop = convertobject(tranformfnc(x), settings); //WatchedVariable(tranformfnc(x), settings);

                        if (clonedprop.is_proxy !== undefined)
                            children.push(clonedprop.listener);

                        // And if this element has children, we'll need to set this object as their parent
                        mychildren.forEach(child => { child.__parent = clonedprop; });

                        return clonedprop;
                    }, settings.cloneobjects);
                }

                // Now create the listener for the variable prior to setting it in the target
                value = WatchedVariable(value, settings);

                // Finally set the parents to the listeners
                value.listener.__parent = proxy;
                children.forEach(child => { child.__parent = value; });
            } else {
            }
            return value;
        }

        // Class Proxy cannot be extended, so we are using a workaround by using helper object which is scoped
        //   to the function that creates the Proxy (at the end is somehow the same than extending the class,
        //   except for the thing that we need to keep track of the methods that we wanted to be added to the
        //   proxy object and proxy them to the helper object (i.e. the listener object))
        let listener = null;

        // Now create the proxy by instantiating the class
        let proxy = new Proxy(original, {
            get(target, name, receiver) {
                // Create the listener if it doesn't exist (it is scoped to the current proxy)
                if (listener === null) {
                    listener = new ListenerController(proxy, target, settings);
                }
                // First check if the property is defined for the proxy itself so that we can return it.
                //   These are "somehow" properties of the proxy that are not proxied to the target.
                switch (name) {
                    case "is_proxy":
                        return true;
                    case "listener":
                        return listener;
                    case "value":
                        return function() {
                            return jsutillib.clone(target, function(x) {
                                if (is_proxy(x)) {
                                    return x.object();
                                } 
                                return x;
                            });
                        }
                    case "object":
                        return function() {
                            return target;
                        }
                }
                // These are other functions that are not proxied to the target, but are served by the "listener"
                if ([ "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent"].includes(name)) {
                    return listener[name].bind(listener);
                }

                // Any other property or method is proxied to the target
                let rv = Reflect.get(target, name, receiver);
                return rv;
            },
            set(target, name, value, receiver) {
                // Create the listener if it doesn't exist (it is scoped to the current proxy)
                if (listener === null) {
                    listener = new ListenerController(proxy, target, settings);
                }
                let reserved = (["value", "listener", "is_proxy", "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent"].includes(name));
                if (reserved) {
                    throw new Exception('invalid keyword')
                }
                if (settings.listenonchildren) {
                    value = convertobject(value, settings);
                }

                // We'll set the value and expect that the garbage collector will take care of the old value
                let retval = Reflect.set(target, name, value, receiver);

                // Now we'll dispatch the event via the listener
                listener.__fire_events(name, value);
                return retval;
            }
        });

        return proxy;
    }
    exports._GLOBALS = WatchedVariable({});
    exports.jsutillib.WatchedVariable = WatchedVariable;
})(window, document);
