# Active Object

_ActiveObject_ is a library that converts an object into an _active object_ that can emit events when one of its properties changes its value.

The use case is better explained with an example. Let's have a var named _people_ that contains a list of people (e.g. _Bob_ and _Alice_), and we convert that variable into *a_people*, which is an active object:

```javascript
let people = [ { name: "Alice" }, { name: "Bob" } ]
let a_people = ActiveObject(people)
```

For the purpose of the library, from now on we have to use the new variable *a_people* instead of the original one. But it is possible to watch for changes in that active object (e.g. show a text in the console):

```javascript
a_people.watch('', function (e) {
    console.log('the list of people has changed', e)
})
```

And now, if we change the name of one of the persons in the list, our function will be triggered

```javascript
$ a_people[1].name = 'John'
list of people has changed
{event: {…}, variable: 'name', fqvn: '1.name', value: 'John', stopPropagation: ƒ}
    event:
        cancelled: false
        from: "1.name"
        target: Proxy {name: 'John'}
        type: "change"
        [[Prototype]]: Object
    fqvn: "1.name"
    stopPropagation: ƒ ()
    value: "John"
    variable: "name"
    [[Prototype]]: Object
```

> _ActiveObject_ can be used as a standalone library in your web applications, but it is also part of [`jsutilslib`](https://github.com/jsutilslib/jsutilslib), which is a library that consists of a set of curated components, utility functions, clases, etc. that are flexible enough to be re-used in different javascript applications.


## Why Active Objects

Web applications are asynchronous and we have different methods to deal with asynchrony: _event subscription_, _promises_, _callbacks_, etc. ActiveObject pretends to be _yet another method to deal with asynchrony_, placing the focus in variables and objects instead of events.

An example is to retrieve a set of data from the internet (e.g. using _fetch_ library), and when a variable finally contains the retrieved and processed data, react doing things.

In the next example, we retrieve a list of _trivia_ questions from [the open trivia database](https://opentdb.com/). Once they are retrieved, these questions are stored in an active object. The active object is watched for changes, and whenever the field `questions` changes, a function is triggered (that function renders the questions elsewhere):

```javascript
let trivia = jsutilslib.ActiveObject();
trivia.watch('questions', function(e) {
    clear_questions();
    for (let i in trivia.questions) {
        render_question(trivia.questions[i]);
    }
}, true)
fetch("https://opentdb.com/api.php?amount=25&difficulty=easy&type=multiple").then(function(response) {
    response.json().then(function(data) {
        if (data.response_code == 0) {
            trivia.questions = data.results;
        }
    })
});
```

This simple example could be implemented by other means (e.g. using other _then_ function that renders). But _ActiveObject_ library enables to do it in this way.

## Installation

### From a CDN

The preferred method to use _ActiveObject_ is to get it from a CDN:

```html
<script src="https://cdn.jsdelivr.net/gh/jsutilslib/common@1.0.0-beta/common.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/jsutilslib/activeobject@1.0.0-beta/activeobject.min.js"></script>
```

> Library [`jsutilslib/common`](https://github.com/jsutilslib/common) is a prerrequisite for this library.

* Please consider using the whole library [jsutils](https://github.com/jsutilslib/jsutilslib).

### From source

There are a set of _javascript_ files that contain a part of the library, each one (in folder `js`). These files can be used individually or combined into a single one, by concatenating them (or by using `uglify-js`).

A `Makefile` is provided to create the single all-in-one `js` files for the library.

```console
# npm install -g uglify-js
...
# git clone https://github.com/jsutilslib/common
# cd common
# make
uglifyjs js/*.js  -b | cat notice - > common.js
uglifyjs js/*.js  | cat notice.min - > common.min.js
# git clone https://github.com/jsutilslib/activeobject
# cd activeobject
# make
uglifyjs js/*.js  -b | cat notice - > activeobject.js
uglifyjs js/*.js  | cat notice.min - > activeobject.min.js
```

Now you can use files `common.min.js` and `activeobject.min.js` in your project:

```html
<script src="common.min.js"></script>
<script src="activeobject.min.js"></script>
```

> Library [`jsutilslib/common`](https://github.com/jsutilslib/common) is a prerrequisite for this library.

## Working with ActiveObject

When importing the library, a default sink for objects is automatically created. It is `window.$watched`.

It is advisable to use the default `$watched` object in most of cases, but it is also possible to create your own _ActiveObject_ to define its particular behavior.

Let's walk on an example:

1. Using function `watch` from any _ActiveObject_, we will watch for changes on its properties. And if a change happens, the provided function will be triggered. (in the example, when variable `$watched.person` changes, the function `welcome` will be executed).

```javascript
function welcome(e) {
    console.log("one new person has arrived");
}
$watched.watch('person', welcome);
```

> Have in mind that `$watched.person` does not yet exist, but we are watching for its changes.

Now we create the property:

```javascript
$watched.person = [];
```

> If inspecting the console, we'll see that the event has been triggered.

In this moment we are creating two person: Bob and Alice.

```javascript
class Person {
    constructor(name) {
        this.name = name;
        this.friends = [];
    }
}
let Bob = new Person("Bob");
let Alice = new Person("Alice");
```

Now we add Bob to the list of person:

```javascript
$watched.person.push(Bob)
```

> Surprisingly the event is not triggered, but this is because variable `$watched.person` still is a list; it has changed its content.

If we wanted to watch the content of `$watched.person` we should subscribe for changes on `person.?` or `person.*`, depending on what we wanted. 

> Char `?` matches one single property and `*` matches any amount of properties in the _full qualified variable name_.

```javascript
$watched.watch('person.?', function(e) {
    let person = this[e.variable];
    console.log(`hi ${person.name}`);
})
```

Now we add Alice to the list of person:

```javascript
$watched.person.push(Alice)
```

> Now the event is triggered and we can check the console to see the welcoming text to Alice.

But we can also subscribe to properties of properties, as in the next example

```javascript
$watched.watch('person.?.friends.?', function(e) {
    let person = this[e.variable];
    console.log(`a new friendship with ${person.name}`);
})
```

Now if we add Alice as a friend of Bob, we'll see that the function is properly triggered:
```javascript
$watched.person[0].friends.push(Alice)
```

The final situation it
```javascript
JSON.stringify($watched.person)
'[{"name":"Bob","friends":[{"name":"Alice","friends":[]}]},{"name":"Alice","friends":[]}]'
```

## Options

The prototype for the function is:

```javascript
function ActiveObject(original = {}, options = {})
```

Where `original` is the original object to make active, and options configure the way that the active object will behave. The default values are the next:

```javascript
options = {
    // The depth of the properties that can be watched
    propertiesdepth: -1,
    // Whether to clone objects prior to watch the object (refer both to the original one and the values that are set to the properties)
    cloneobjects: false,
    // If propagatechanges is true, the events of changes of a variable are propagated to its parent objects
    propagatechanges: false,
};
```

### propertiesdepth
One object is built by its properties, but these properties may also be objects that have their own properties and so on. _ActiveObject_ enables to watch changes in the properties, and that behavior is controlled by option `propertiesdepth`.

Being `a` is an _ActiveObject_, we can set value of `a.b.c.d` to value `"Test"`. If we set `propertiesdepth` to watch for changes at any depth, such change of `a.b.c.d` to `"Test"` will trigger an event. But it is also possible to not to watch for in-depth properties by changing the value of `propertiesdepth`:

- _`-1`_: means that we want to enable watching for changes at any depth of properties.
- _`0`_: means that we do not want to watch for changes at any depth of properties. We are only interested on changes on root properties.
- _`any other value`_: sets the maximum depth to enable watching for changes (e.g. depth `2` means that in `a.b.c.d`, changes to `a.b.c` will trigger events, but `a.b.c.d` no).

### cloneobjects
The _original object_ and the values that are assigned to the properties of the _ActiveObject_ may be objects. In javascript, any object is passed by reference, and _ActiveObject_ deals with it by transforming the objects and its properties into _ActiveObjects_.

As the objects are references, if `ob1 = { a:1, b: 2}; $watched.ob1 = ob1;`, if we set `$watched.ob1.a = 3`, it will be reflected in `ob1`: `JSON.stringify(ob1)` is `{"a":3,"b":2}`. Reciprocally, if we set `ob1.b = 4`, `JSON.stringify($watched.ob1)` is `{"a":3,"b":4}`.

If we do not want such behavior, we can use `jsutilslib.clone` function to obtain a deep clone from the object to use in either case. But it is also possible to initialize the object using `cloneobjects` to `true`. In such case, any object in the tree will be cloned before using it.

> This behavior is all-or-none. If you want to change it for each property, it is better to use `jsutilslib.clone` when needed.

### propagatechanges
When setting the value of a in-depth property of the object (e.g. `a.b.c.d = 1`), it is obvious that `a.b.c.d` has changed, and the events will be triggered.

But one can consider that `a.b.c` has also changed, and `a.b` too, and so `a`. This is called _propagation of changes_. 

An _ActiveObject_ may want to propagate or not the events of changes in the leaves to the root object, and that is controlled by setting `propagatechanges`. If set to `true` the changes will be propagated to the root.

## Properties and Functions

_ActiveObject_ is not a class, but a function that returns a [Javascript Proxy](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Proxy), that contains additional functions:

- _is_proxy_: is a property whose value is `true`.
- _watcher_: is a property used to obtain the _watch controller_ object, which is used for internal purposes (you should know that it is here, but it is better to not to deal with it).
- _watch_: is the function used to subscribe to changes in properties.
- _unwatch_: is the function used to subscribe to changes in properties.
- _value_: returns the _plain object_ that is being controlled by the _ActiveObject_ (it will keep the types and classes of each property)
- _settings_: returns a copy of the settings for the object (if the copy is modified, it does not affect to the effective settings of the object)
- _reconfigure_: enables the reconfiguration of an active object (and its children properties)

### watch

Function `watch` is used to subscribe to changes in the properties of an _ActiveObject_

```javascript
function watch(varname, eventHandler, autocancel = false)
```

- _varname_ is the _Fully Qualified Variable Name_ to which is wanted to subscribe for changes. That means that (starting from the properties of the object to which is requested the subscription), the _varname_ may contain properies and properties of properties.

    in

    ```javascript
    $watched.a = { b: { c: { d: {} }} }
    ```

    we can subscribe for changes as `$watched.a.watch("b.c.d", function() ...)`, but also to `$watched.a.watch("b", function() ...)`, depending on our insterests.

    There are special values for matching the _FQVN_: `?` will match a single property, while `*` will match any sequence of properties. e.g. `b.c.d`, `b.?.?`, `b.*` will match `b.c.d`, and so any changes to `b.c.d` will trigger events for the three expressions.

- _eventHandler_ is the function called when a change is detected, and the prototype of the function is the next:

    ```javascript
    function eventHandler(e)
    ```

    Where `e` is an object of type _ActiveObject event_

    ```javascript
    event = {
        event: {
            target: originalproxy,  // The real target is the proxy object that triggered the event
            type: "change",         // The type of the event is "change"
            from: var_fqn,          // The variable that has triggered the event
            cancelled: false        // Whether the event has been cancelled or not
        },
        variable: var_name,             // The name of the variable in the object that receives the event
        fqvn: var_fqn,                  // The full qualified name of the variable that receives the event
        value: proxy[var_name],         // New value
        stopPropagation: function() {   // Function to stop propagation (if activated)
            e.cancelled = true;
        }
    }
    ```
- _autocancel_: if set to `true`, if any watch rule matches the modified variable, the event is triggered but it is also autocancelled after the execution of the callback. So any other watch matching is prevented and so the event propagation (if activated).

### unwatch

Function `unwatch` is used to stop receiving subscriptions about the changes of an _ActiveObject_.

```javascript
function unwatch(varname, eventHandler = null)
```

- _varname_ is the string used as the _varname_ when calling function `watch`. No other type of variable substitution or expansion is made. If does not exist, it does nothing.

- _eventHandler_ is the event handler that is wanted to remove. If set to `null`, any event handler for rule _varname_ is removed.

### value

Is the function used to retrieve the _plain object_ from an _ActiveObject_. Although an _ActiveObject_ can be used intechangeable with the original one (e.g. for serializing), the original object can be retrieved using this function.

### settings

This is a readonly property that returns a copy of the actual settings of the _ActiveObject_. Updating this copy have no effect in the actual settings of the object. For that purpose, use function _reconfigure_.

### reconfigure

It is a function that enables to reconfigure an object (and its children properties, if wanted)

```javascript
function reconfigure(options, reconfigurechildren = true)
```

The reconfiguration will take effect from the call of the function on. It is important that the actions made before calling that option will not be changed. e.g. if the object had setting `cloneobjects` set to `false`, even reconfiguring it to `true` **will not make that not cloned objects will be cloned**; instead, the new objects used for the properties **will be cloned**.

## Use case

Let's have the next use case (to follow the use case, we can use the console of _chrome_ or any _chromium_ derived browser)

```javascript
> $watched.a = { b: { c: { d: {} }} }
> $watched.watch('a', function(e) { console.log(`changes`, e); })
```

The default configuration of `$watched` is to not to propagate events. So if we make changes in the children properties

```javascript
> $watched.a.b.c.d.e = "a new value";
```

The watch that we have defined will not be propagated. If we want to change the behavior, we could reconfigure the object:

```javascript
> $watched.a.reconfigure({propagatechanges: true});
```

And now if we make a similar change, the watch will be triggered

```javascript
> $watched.a.b.c.d.f = "other new value"
...
changes {event: {…}, variable: 'a', fqvn: 'a', value: Proxy, stopPropagation: ƒ}
```

If properties are also watched, we could intercept the event at a deeper stage, and stop its propagation using the event's `stopPropagation` function:

```javascript
> $watched.watch('a.b.c', function(e) { console.log(`intercepted changes`, e); e.stopPropagation(); })
```

Now if introduced changes, the event will be intercepted in the new watch but not in the upper, but if changes are made outside the scope of this subscription, they will arrive to the root:

```javascript
> $watched.a.b.c.d.g = "yet another new value"
intercepted changes {event: {…}, variable: 'c', fqvn: 'a.b.c', value: Proxy, stopPropagation: ƒ}
> $watched.a._b = "a new property"
changes {event: {…}, variable: 'a', fqvn: 'a', value: Proxy, stopPropagation: ƒ}
```

The watches can also be removed using `unwatch` method, and the other watches will continue working
```javascript
> $watched.unwatch('a.b.c')
> $watched.a.b.c.d.h = "the last change"
changes {event: {…}, variable: 'a', fqvn: 'a', value: Proxy, stopPropagation: ƒ}
```

After all these changes, our object will be the next

```javascript
> JSON.stringify($watched.a)
'{"b":{"c":{"d":{"e":"a new value","f":"yet another new value","h":"the last change"}}},"_b":"a new property"}'
```
