(function (object_container, load_order, resolutions) {

            var makeOnLoadHandler;
            var i;
            var el;
            var initial_keys;
            var has_exported = {};
            
            window.get_filename = function() {
                // Use the printStackTrace library
                var trace = printStackTrace(); // jshint ignore:line

                // 5 Steps back in the call trace works for calls through
                // module.exports or require().
                var input = trace[5];

                // Extract the filename part relative to root
                var re = new RegExp("//[^/]*/([^:]*)");

                return re.exec(input)[1];
            };

            Object.defineProperty(window, "exports", {
                get: function() {
                    return object_container[resolutions[window.get_filename()]['.']];
                },
                set: function(x)
                {
                    var filename = window.get_filename();
                    var obj = resolutions[filename]['.'];
                    has_exported[filename] = true;
                    if(x !== object_container[obj]) {
                        object_container[obj] = x;
                    }
                }
            });

            /* Getting module returns window, which has exports.
            * setting module assumes that you are saying module.exports = x;
            * without actually overwriting it. Such as returning {exports: window.exports} would have.*/
            Object.defineProperty(window, "module", {
                get: function() {
                    return window;
                },
                set: function(x) {
                    if(x !== window.exports) {
                        window.exports = x;
                    }
                }
            });


            window.require = function(relative_url) {
                return object_container[resolutions[window.get_filename()][relative_url]];
            };

            window.template = window.require;


            /* Record what keys has been set on the global (window) object, so we can remove them later. */
            initial_keys = Object.keys(window);

            makeOnLoadHandler = function (index) {
                /* Keep an out on which file we are loading. Because get_filename() won't have the right call stack
                 * from an asynchronous event defined this file. */
                var filename = load_order[index];
                var container_index = resolutions[filename]['.'];

                return function () {


                    // Remove all new keys on the global object (window) but since scripts should expose something
                    // through the module.exports interface take the first key if they have not.

                    var current_keys = Object.keys(window);
                    var added_keys = current_keys.filter(function (n) {
                        return (initial_keys.indexOf(n) === -1);
                    });

                    if (added_keys.length > 0) {
                        if (has_exported[filename] !== true) {
                            object_container[container_index] = window[added_keys[0]];
                            console.error('Variable window[' + added_keys[0] + '] taken as export in lieu of explicit module.exports. @' + filename);
                        }

                        added_keys.forEach(function (key) {
                            delete window[key];
                        });
                    }
                    
                    if(index === load_order.length - 1) {
                     // Last object loaded, fire an event or something here.
                        delete window['has_exported'];
                    }
                };
            };

            for(i=0; i<load_order.length; ++i) {
                el = document.createElement("script");
                el.async = false;
                el.type = "text/javascript";

                el.onload = makeOnLoadHandler(i);

                el.src = '/' + load_order[i];

                document.head.appendChild(el);
            }
        })(
//object_container
[
    {},
    {},
    {},
    "this is a template\n"
],
//load_order
[
    "example/underscore.js",
    "example/backbone.js",
    "example/entry_point_1.js"
],
//resolutions
{
    "example/entry_point_1.js": {
        ".": 0,
        "backbone": 1,
        "page.tpl.html": 3
    },
    "example/backbone.js": {
        ".": 1,
        "underscore": 2
    },
    "example/underscore.js": {
        ".": 2
    }
}
);