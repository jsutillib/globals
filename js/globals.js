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

    /** Function that returns true if an object is a proxy
     * @param {*} obj the object to check
     * @returns true if the object is a proxy
     */
    function is_proxy(p) {
        return (typeof p === 'object') && (p.is_proxy !== undefined);
    }

    /**
     * Class used to manage the events for the proxy objects. This should be a private class that should not be used directly
     */
    class ListenerController {

        constructor(settings, subscriptions) {
            this.__subscriptions = subscriptions;

            // Duplicate the settings to avoid modifying the original settings
            this.__settings = Object.assign({}, settings);
            this.__event_listeners = [];
            this.__parent = null;
        }

        // Sets the value for the proxy object and the target, to enable firing events
        set_proxy(proxy, target) {
            this.__proxy = proxy;
            this.__target = target;
        }

        // This function is used to "fire" the events for the proxy object: both the callbacks for the watched variables and the events for the objects in the DOM
        //   This function is only for internal purposes (also the class)
        __fire_events(name, value, suffix = "") {
            if (this.__proxy === null) {
                return false;
            }
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
            // Now we'll get the FQN of the variable and fire the events for it
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

        // Add functions to the listener so that it can act as an event dispatcher 
        //  (other objects may be subscribed to these events).
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

        // This function is used to notify the listeners of the proxy object that a variable has changed
        //   The event will be dispatched first, and then the subscriptions
        notify(varname, value, from) {

            // We'll create a custom event and will dispatch it to any of the dispachers set by the user in the settings
            //  and to this object also (first to this object)
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: { varname, value, from }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });

            // We'll check the subscriptions of this object and the parent object (because the properties build a
            //   tree of objects, and subscriptions may be defined for each part of the tree)
            let subscriptions = this.get_parent_subscriptions();

            if (!e.cancelBubble) {
                // If any of the subscriptions match the var name, we'll fire the appropriate callback
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

        // Get the subscriptions of the parent object (if any), combined with the subscriptions of this object
        get_parent_subscriptions() {
            if (this.__parent === null) {
                return this.__subscriptions;
            }
            return Object.assign({}, this.__subscriptions, this.__parent.listener.get_parent_subscriptions());
        }

        // Adds a listener for the variables of the object. The listener will be notified when the variable changes
        // @param varname the name of the variable to watch
        // @param eventHandler the callback to call when the variable changes
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
                if (this.__subscriptions[varname] === undefined) {

                    let re = varname.replace(".", "\\.").replace("*", ".*").replace("?", "[^.]*");
                    re = `^${re}$`

                    this.__subscriptions[varname] = {
                        re: new RegExp(re),
                        callbacks: []
                    };
                }
                this.__subscriptions[varname].callbacks.push(eventHandler);
            }.bind(this));
        }
        // Stops listening for the variables of the object. The listener will no longer be notified when the variable changes
        // @param varname the name of the variable to stop watching
        // @param eventHandler the callback to call when the variable changes
        unlisten(varname, eventHandler) {
            if (this.__subscriptions[varname] === undefined) {
                return;
            }
            this.__subscriptions[varname].callbacks.filter(function(e) {
                return e !== eventHandler;
            });
        }
    }

    /**
     * Set the function to create the proxy objects. 
     *   - Original procedure from from https://stackoverflow.com/a/69459844/14699733 
     */
    let WatchedObject = (original, options = {}) => {
        // Simple variables cannot be proxied
        if (typeof original !== "object") {
            return original;
        }

        // Default values for settings
        let defaults = {
            propertiesdepth: 0,
            listenonchildren: true,
            eventtarget: [ window ],
            eventtype: 'watch',
            cloneobjects: false,
            convertproperties: true
        };

        // Get the settings for this proxy
        let settings = jsutilslib.merge(defaults, options);
        if (!Array.isArray(settings.eventtarget)) {
            settings.eventtarget = [ settings.eventtarget ];
        }

        // Prepare the subscriptions for this call
        let subscriptions = {};

        // Class Proxy cannot be extended, so we are using a workaround by using helper object which is scoped
        //   to the function that creates the Proxy (at the end is somehow the same than extending the class,
        //   except for the thing that we need to keep track of the methods that we wanted to be added to the
        //   proxy object and proxy them to the helper object (i.e. the listener object))
        let listener = new ListenerController(settings, subscriptions);

        // In the next phases, we are converting the object, according to the settings (i.e. clone, )

        // Let's prepare an array for the eventual properties that may have been converted into WatchedObjects,
        //   so that we can set the parent for them. We cannot set the parent because the object is not yet
        //   created, when the properties are being converted.
        //
        // If we tried to convert the properties later, the events may be fired during the conversion,
        let children = [];
            
        // If needed, we'll clone the object
        if (settings.cloneobjects) {
            original = jsutilslib.clone(original);
        }

        // If we are listening on children, we'll convert the properties (or elements of the array)
        if (settings.listenonchildren) {

            function convertproperty(x) {
                // Convert each property into a watched variable
                let clonedprop = WatchedObject(x, settings);
    
                // If the property is not an object, it will not be proxied
                if (clonedprop.is_proxy !== undefined)
                    children.push(clonedprop.listener);
    
                return clonedprop;
            }
    
            if (Array.isArray(original)) {
                original = original.map(convertproperty);
            } else {
                jsutilslib.processprops(original, convertproperty);
            }
        }

        // Now create the proxy by instantiating the class
        let proxy = new Proxy(original, {
            get(target, name, receiver) {
                // Set the proxy for the listener (this is a one-time operation, but it is controlled in the function itself)
                listener.set_proxy(proxy, target);

                // First check if the property is defined for the proxy itself so that we can return it.
                //   These are "somehow" properties of the proxy that are not proxied to the target.
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
                // Set the proxy for the listener (this is a one-time operation, but it is controlled in the function itself)
                listener.set_proxy(proxy, target);

                // There are some reserved keywords that cannot be set
                let reserved = (["value", "listener", "is_proxy", "listen", "unlisten", "addEventListener", "removeEventListener", "dispatchEvent"].includes(name));
                if (reserved) {
                    throw new Exception('invalid keyword')
                }

                // Create the watched variable for the value
                value = WatchedObject(value, settings);

                // We'll set the value and expect that the garbage collector will take care of the old value
                let retval = Reflect.set(target, name, value, receiver);

                // Now we'll dispatch the event via the listener
                listener.__fire_events(name, value);
                return retval;
            }
        });

        // Defered setting the parent
        children.forEach(child => { child.__parent = proxy; });

        return proxy;
    }
    exports.$watched = WatchedObject({});
    exports.jsutilslib.WatchedObject = WatchedObject;
})(window);
