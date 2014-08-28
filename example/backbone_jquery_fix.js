/* When backbone is loaded node.js style it doesn't require jquery, 
* some libraries (ie. marionette) expect jquery to be set on backbone.
* 
* To force this script to be included before anything else, run the loader as:
*    ./loader.js output.js backbone_jquery_fix.js entry_point.js
*/
(function() {
    require('backbone').$ = require('jquery');
})();