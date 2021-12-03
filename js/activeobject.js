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
        return (p !== null) && (typeof p === 'object') && (p.is_proxy !== undefined);
    }

    /**
     * Class used to manage the events for the proxy objects. This should be a private class that should not be used directly
     */
    class WatchController {

        constructor(settings, subscriptions) {
            this.__subscriptions = subscriptions;

            // Duplicate the settings to avoid modifying the original settings
            this.__settings = Object.assign({}, settings);
            /*
            this.__event_listeners = [];
            */
            this.__parent = null;
        }

        // Sets the value for the proxy object and the target, to enable firing events
        set_proxy(proxy, target) {
            this.__proxy = proxy;
            this.__target = target;
        }

        /**
         * Function that gets the tree of proxy object; the first element in the array is the top-level proxy object,
         *   and the last element is the target object.
         * The main utility for this function is to get the FQN for the proxies, for notification purposes. The original 
         *   idea was to make that each proxy had its FQN during the creation, but this is not possible because of the
         *   arrays: the position in the array may change during the time so a FQN object.array.1 for a element in the
         *   array may change in the time.
         */
        get_proxy_tree(name = null, value = null) {
            if (name === null) {
                // Let's look for this child in the properties
                for (let prop in this.__target) {
                    if (this.__target[prop] === value) {
                        name = prop;
                        break;
                    }
                }
                // Could not find the child, so it is not my child (it should not happen)
                if (name === null) {
                    throw new Error(`Could not find the value in the properties of the proxy`);
                }
            } else {
                // This case is needed, because leaves (which start triggering the events)
                //   may get non-proxied values that may be the same in multiple properties (e.g. value "3")
            }

            if (this.__parent !== null) {
                return [ ...this.__parent.watcher.get_proxy_tree(null, this.__proxy), {
                    p: this.__proxy,
                    n: name
                }];    
            } else {
                return [ {
                    p: this.__proxy,
                    n: name}
                ];
            }
        }

        // This function is used to "fire" the events for the proxy object: both the callbacks for the watched variables and the events for the objects in the DOM
        //   This function is only for internal purposes (also the class)
        __fire_events(name, value) {
            // We are not subscribing to the values managed by the class, because they are not always managed in the same way (e.g. length in arrays is updated when increased but not when removing one element)
            if (this.__target.__proto__[name] !== undefined) {
                return;
            }

            let proxy_tree = this.get_proxy_tree(name, value);

            /*
            let triggerer = proxy_tree.map(x => x.n).join(".");

            // We'll create a custom event and will dispatch it to any of the dispachers set by the user in the settings
            //  and to this object also (first to this object)
            let e = new CustomEvent(this.__settings.eventtype, {
                detail: { var: triggerer, value }
            });
            this.dispatchEvent(e);
            this.__settings.eventtarget.forEach(et => {
                et.dispatchEvent(e);
            });
            */

            this.notify(proxy_tree);
        }

        notify(proxy_tree, e = null) {
            // The last element of the proxy_tree is the proxy object itself
            let var_fqn = proxy_tree.map(x => x.n).join(".");
            let var_name = proxy_tree[proxy_tree.length - 1].n;
            let proxy = this.__proxy;
            proxy_tree.pop();

            // If the event was not created yet, this is the first notification and so we are generating the bubble of notification (i.e. the notification will be
            //   sent upwards in the hiearchy); otherwise, we are not in charge of managing the bubble
            let havetonotifyparents = true;
            if (e === null) {
                e = {
                    target: proxy,      // The real target is the proxy object that triggered the event
                    type: "change",     // The type of the event is "change"
                    from: var_fqn,
                    cancelled: false
                }
            } else {
                havetonotifyparents = false;
            }

            // This is the actual event that we are sending to each callback
            let event = {
                event: e,
                variable: var_name,
                fqvn: var_fqn,
                value: proxy[var_name],
                stopPropagation: function() {
                    e.cancelled = true;
                }
            }

            // Now we get the subscriptions from the parent, because we are allowing that each parent can store subscriptions for his eventual children
            let subscriptions = this.get_parent_subscriptions();

            for (let k in subscriptions) {
                let subscription = subscriptions[k];

                // If there are subscriptions for this variable, let's call the callbacks
                if (subscription.re.test(var_fqn)) {
                    subscription.callbacks.forEach(function(sub) {
                        // Once the event is cancelled, stop anything
                        if (e.cancelled) {
                            return;
                        }
                        // We'll call the callback, by binding the proxy to the callback (to allow accessing the values of the proxy)
                        sub.callback.call(proxy, event);
                    });        
                }
                // Once the event is cancelled, stop anything
                if (e.cancelled) {
                    break;
                }
            }

            // If this is the bubble manager, we need to make the event go up in the hierarchy
            if (havetonotifyparents && (this.__settings.propagatechanges === true)) {
                for (let i = proxy_tree.length; (!e.cancelled) && (i > 0); i--) {
                    let c_proxy = proxy_tree[i - 1].p;
                    c_proxy.watcher.notify(proxy_tree, e);
                }
            }
        }

        /*
        // Add functions to the watcher so that it can act as an event dispatcher 
        //  (other objects may be subscribed to these events).
        addEventListener(type, eventHandler) {
            this.__event_listeners.push({
                type: type,
                eventHandler: eventHandler
            });
        }

        dispatchEvent(event) {
            let proxy = this.__proxy;
            this.__event_listeners.forEach(listener => {
                if (listener.type === event.type) {
                    listener.eventHandler.call(proxy, event);
                }
            });
        }

        removeEventListener(type, eventHandler) {
            this.__event_listeners = this.__event_listeners.filter(listener => {
                return listener.type !== type || listener.eventHandler !== eventHandler;
            });
        }
        */

        // Get the subscriptions of the parent object (if any), combined with the subscriptions of this object
        get_parent_subscriptions() {
            if (this.__parent === null) {
                return this.__subscriptions;
            }
            return Object.assign({}, this.__subscriptions, this.__parent.watcher.get_parent_subscriptions());
        }

        // Adds a watcher for the variables of the object. The watcher will be notified when the variable changes
        // @param varname the name of the variable to watch
        // @param eventHandler the callback to call when the variable changes
        // @param autocancel if true, if the subscription is matched, the event will be cancelled in the bubble
        watch(varnames, event_handler, autocancel = false) {
            if (! Array.isArray(varnames)) {
                varnames = [varnames];
            }

            varnames.forEach(function (varname) {
                if (varname === "") {
                    varname = "*";
                }
                if (this.__subscriptions[varname] === undefined) {

                    let re = varname.replaceAll(".", "\\.").replaceAll("*", ".*").replaceAll("?", "[^.]*");
                    re = `^${re}$`

                    this.__subscriptions[varname] = {
                        re: new RegExp(re),
                        callbacks: [],
                    };
                }
                this.__subscriptions[varname].callbacks.push({
                    callback: event_handler, autocancel: autocancel
                } );
            }.bind(this));
        }
        // Stops watching for the variables of the object. The watcher will no longer be notified when the variable changes
        // @param varname the name of the variable to stop watching
        // @param eventHandler the callback to call when the variable changes (if null, removes any handler for that varname)
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

        // Sets the new settings
        set_settings(settings) {
            // They have been computed in the parent
            this.__settings = settings;
        }
    }

    /**
     * Set the function to create the proxy objects. 
     *   - Original procedure from from https://stackoverflow.com/a/69459844/14699733 
     */
    let ActiveObject = (original = {}, options = {}) => {
        if (original === null) {
            return null;
        }

        // Simple variables cannot be proxied
        if (typeof original !== "object") {
            return original;
        }

        // Default values for settings
        let defaults = {
            // The depth of the properties that should be proxied: -1 means all properties, 0 means only the root properties and 1, 2, 3... is related to the relationship of the 
            //   objects in properties of other objects (e.g. in a.b.c.d, d is in depth 3)
            propertiesdepth: -1,
            // Whether to clone objects prior to including it in the proxy tree or not
            cloneobjects: false,
            // If true, a change to a leave of an object tree (e.g. a.b.c.d = 4) will notify watchers of (a.b.c.d, a.b.c, a.b and a); otherwise only watchers of the triggerer property (i.e. a.b.c.d) will be notified
            //   This value can be overridden in the watch function, but this is the default value for all watchers.
            propagatechanges: false,
            /*
            // The elements to which the event of a variable change is dispatched
            eventtarget: [ window ],
            // The event type of the variable change
            eventtype: 'watch',
            */
        };

        // Get the settings for this proxy
        let settings = jsutilslib.merge(defaults, options);

        /*
        if (!Array.isArray(settings.eventtarget)) {
            settings.eventtarget = [ settings.eventtarget ];
        }
        */

        // Prepare the subscriptions for this call
        let subscriptions = {};

        // Class Proxy cannot be extended, so we are using a workaround by using helper object which is scoped
        //   to the function that creates the Proxy (at the end is somehow the same than extending the class,
        //   except for the thing that we need to keep track of the methods that we wanted to be added to the
        //   proxy object and proxy them to the helper object (i.e. the watcher object))
        let watcher = new WatchController(settings, subscriptions);

        // In the next phases, we are converting the object, according to the settings (i.e. clone, )

        // Let's prepare an array for the eventual properties that may have been converted into ActiveObjects,
        //   so that we can set the parent for them. We cannot set the parent because the object is not yet
        //   created, when the properties are being converted.
        //
        // If we tried to convert the properties later, the events may be fired during the conversion,
        let children = [];
            
        // If needed, we'll clone the object
        if (settings.cloneobjects) {
            original = jsutilslib.clone(original);
        }

        // If we are watching on children, we'll convert the properties (or elements of the array)
        if (settings.propertiesdepth !== 0) {

            // If the depth for the properties is limited, let's decrease it by one as we get deeper
            let propsettings = settings;
            if (settings.propertiesdepth > 0) {
                propsettings = jsutilslib.merge(settings, { propertiesdepth: settings.propertiesdepth - 1 });
            }

            function convertproperty(x) {
                // Convert each property into a watched variable
                let clonedprop = ActiveObject(x, propsettings);
    
                // If the property is not an object, it will not be proxied
                if (clonedprop.is_proxy !== undefined)
                    children.push(clonedprop.watcher);
    
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
                // Set the proxy for the watcher (this is a one-time operation, but it is controlled in the function itself)
                watcher.set_proxy(proxy, target);

                // First check if the property is defined for the proxy itself so that we can return it.
                //   These are "somehow" properties of the proxy that are not proxied to the target.
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
                        }
                    case "reconfigure":
                        return function(options, reconfigurechildren = true) {
                            // Recompute the settings for this object and transfer them to the watcher
                            settings = jsutilslib.merge(settings, options);
                            watcher.set_settings(settings);

                            if (reconfigurechildren) {
                                // Recompute the settings for the children and transfer them to the watcher
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
                        }
                    case "settings":
                        return jsutilslib.clone(settings);
                }
                // These are other functions that are not proxied to the target, but are served by the "watcher"
                if ([ "watch", "unwatch" /*, "addEventListener", "removeEventListener", "dispatchEvent" */].includes(name)) {
                    return watcher[name].bind(watcher);
                }

                // Any other property or method is proxied to the target
                let rv = Reflect.get(target, name, receiver);
                return rv;
            },
            set(target, name, value, receiver) {
                // Set the proxy for the watcher (this is a one-time operation, but it is controlled in the function itself)
                watcher.set_proxy(proxy, target);

                // There are some reserved keywords that cannot be set
                let reserved = (["value", "watcher", "is_proxy", "watch", "unwatch", /* "addEventListener", "removeEventListener", "dispatchEvent" */].includes(name));
                if (reserved) {
                    throw new Exception('invalid keyword')
                }

                // Create the watched variable for the value
                value = ActiveObject(value, settings);

                if (is_proxy(value)) {
                    value.watcher.__parent = proxy;
                }

                // We'll set the value and expect that the garbage collector will take care of the old value
                let retval = Reflect.set(target, name, value, receiver);

                // Now we'll dispatch the event via the watcher
                watcher.__fire_events(name, value);
                return retval;
            }
        });

        // Defered setting the parent
        children.forEach(child => { child.__parent = proxy; });

        return proxy;
    }
    exports.$watched = ActiveObject({});
    exports.jsutilslib.ActiveObject = ActiveObject;
    exports.jsutilslib.is_proxy = is_proxy;
})(window);
