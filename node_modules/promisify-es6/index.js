/** PROMISIFY CALLBACK-STYLE FUNCTIONS TO ES6 PROMISES
 *
 * EXAMPLE:
 * const fn = promisify( (callback) => callback(null, "Hello world!") );
 * fn((err, str) => console.log(str));
 * fn().then((str) => console.log(str));
 * //Both functions, will log 'Hello world!'
 *
 * Note: The function you pass, may have any arguments you want, but the latest
 * have to be the callback, which you will call with: next(err, value)
 *
 * @param method: Function/Array/Map = The function(s) to promisify
 * @param options: Map =
 *  "context" (default is function): The context which to apply the called function
 *  "replace" (default is falsy): When passed an array/map, if to replace the original object
 *
 * @return: A promise if passed a function, otherwise the object with the promises
 *
 * @license: MIT
 * @version: 1.0.1
 * @author: Manuel Di Iorio
 **/

"use strict";
 
const createCallback = (method, context) => {
    return function() {
        const args = Array.prototype.slice.call(arguments);   

        return new Promise((solve, reject) => {
            args.push((err, val) => {
                if (err) return reject(err);
                solve(val);
            });

            method.apply(context, args);
        });
    };
};

module.exports = (methods, options) => {
    options = options || {};
    const type = Object.prototype.toString.call(methods);

    if (type === "[object Object]" || type === "[object Array]") {
        const obj = options.replace ? methods : {};

        for (let key in methods)
            if (methods.hasOwnProperty(key))
                obj[key] = createCallback(methods[key]);

        return obj;
    }
    
    return createCallback(methods, options.context || methods);
}