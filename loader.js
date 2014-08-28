#!/usr/bin/node
"use strict";

/* Author: Lars Banner-Voigt, License: Apache License v.2 */

/* The output script also depends on stacktrace.js having been loaded first */
var fs       = require('fs');
var url      = require('url');
var toposort = require('toposort');
var exec = require('child_process').exec;

if(process.argv.length < 4) {
    console.log('use: loader <output_file> <entry_point_1> [entry_point_2..]');
    return 1;
}

/* Command line arguments */
var entry_points = process.argv.splice(3);
var output_file = process.argv[2];


/* Internal bookkeeping */
var errors = [];                   // Collect errors and show them in the end.
var visited = [];                  // List of scanned files
var edges = [];                    // List of dependencies

/* Output */
var resolutions = {};              // Cached url resolves, used in the generated script
var load_order;                    // The calculated order in which to load the scripts.
var object_container = [{}];
var code;

var bower_files = {};


function resolve(_file, _base) {
    var default_file, last_segment, file, base;

    file = _file;
    base = _base ? _base : './';

    /* Make absolute paths into paths from current working directory, ie. the place where the script was executed. */
    if(file[0] === '/') {
        file  = '.' + file;
        base = './';
    }

    if(bower_files[file])
    {
        file = bower_files[file];
        if(file.substr(-3) === '.js') {
            return file; //url.resolve(base, file);
        }
    }
    else {
        file = url.resolve(base, file);
    }

    if(fs.existsSync(file) && fs.statSync(file).isDirectory())
    {
        /* Try index.js */
        default_file = file + '/index.js';

        if(fs.existsSync(default_file)) {
            return default_file;
        }

        /* Try a file named the same as the directory */
        last_segment = file.substring(file.lastIndexOf('/')+1);
        default_file = file + '/' + last_segment + '.js';

        if(fs.existsSync(default_file)) {
            return default_file;
        }

        default_file = file + '/lib/' + last_segment + '.js';

        if(fs.existsSync(default_file)) {
            return default_file;
        }

        errors.push("couldn't find file: " + file);
        return null;
    }


    if(file.substr(-3) !== '.js') {
        file += ".js";
    }

    if(fs.existsSync(file)) {
        return file;
    }

    errors.push('file not found "'+_file+'" from "'+base+'"');

    return null;
}

//noinspection FunctionTooLongJS
function scan_file(unresolved_file) {
    var point, base, template_file, type, match, regexp, capture, contents, js_file, file;

    file = unresolved_file;

    /* If its a valid file don't try to resolve, but resolve on invalid file or a directory */
    if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = resolve(file);
        if(file === null) {
            return null;
        }
    }


    contents = fs.readFileSync(file, {encoding: 'utf-8'});

    // Regex that finds require('') or template('') statements outside comment blocks.
    regexp = /(?:\/\*(?:[\s\S]*?)\*\/)|(?:(?:[\s;])*\/\/(?:.*)$)|[\s=;({[](require|template)\s*\(\s*(['"])(.+?)\2\s*\)/gm;
    match = regexp.exec(contents);

    resolutions[file] = {'.': object_container.length -1};
    while(match !== null)
    {
        type = match[1];
        capture = match[3];

        // Get the next one straightaway
        match = regexp.exec(contents);

        if(capture === undefined) {
            continue;
        }

        if(type === 'require')
        {
            // type is 'require' call
            js_file = resolve(capture, file);
            if(js_file === null) {
                continue;
            }

            if(visited[js_file] === undefined) {
                visited[js_file] = object_container.length;
                object_container.push({});

                js_file = scan_file(js_file);
                if(!js_file) {
                    continue;
                }
            }
            resolutions[file][capture] = visited[js_file];

            /* Ignore files depending on themselves */
            if(file === js_file) {
                errors.push('dependency on itself in ' + file);
                continue;
            }

            edges.push([file, js_file]);
        }
        else
        {
            // type is 'template' call
            base = file;
            point = capture;
            // Make absolute urls to urls relative of the working directory.
            if(point[0] === '/') {
                point  = '.' + point;
                base = './';
            }
            template_file = url.resolve(base, point);
            if(fs.existsSync(template_file)) {
                resolutions[file][capture] = object_container.length;
                object_container.push(fs.readFileSync(template_file, {encoding: 'utf-8'}));
                //edges.push([file, template_file]);
            }
            else {
                errors.push('no such file: '+template_file+' used from: '+file+'');
            }
        }


    }

    return file;
}

function main(_bower_files) {
    bower_files = _bower_files;


    // The topological sort puts the last dependencies first
    // so entry_points is reversed.
    entry_points.reverse().forEach(function(file) {
        scan_file(file);
    });

    // Stop if any errors occurred
    if(errors.length > 0) {
        errors.forEach(function(error) {
            console.log(error);
        });
        console.error('nothing has been output');
        return;
    }


    // Sort the dependency graph
    load_order = toposort(edges).reverse();

    // Output a loader script
    code = '(' + (function() {
        return function(object_container, load_order, resolutions) {

            var makeOnLoadHandler;
            var i;
            var el;
            var initial_keys;
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
                    var obj = resolutions[window.get_filename()]['.'];
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
                        if (object_container[container_index] === undefined ||
                            ((object_container[container_index] instanceof Function) === false &&
                            Object.keys(object_container[container_index]).length === 0)
                        ) {
                            object_container[container_index] = window[added_keys[0]];
                            console.error('Variable window[' + added_keys[0] + '] taken as export in lieu of explicit module.exports. @' + filename);
                        }

                        added_keys.forEach(function (key) {
                            delete window[key];
                        });
                    }
                    /*
                     if(index === load_order.length - 1) {
                     // Last object loaded, fire an event or something here.
                     }
                     */
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
        };
    })().toString() +
    ')(\n'+
    '//object_container\n' +
        JSON.stringify(object_container, null, 4) + ',\n'+
    '//load_order\n' +
        JSON.stringify(load_order, null, 4)       + ',\n'+
    '//resolutions\n' +
        JSON.stringify(resolutions, null, 4)      + '\n'+
    ');';


    //console.log(code);

    fs.writeFile(output_file, code);
}


/* Fetch a list of bower modules, then start the program. See last line of script. */
exec('bower list --json --paths', function(error, stdout, stderr) {
    if(error || stderr) {
        throw error;
    }

    main(JSON.parse(stdout));
});
