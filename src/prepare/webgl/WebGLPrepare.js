var core = require('../../core'),
    SharedTicker = core.ticker.shared;

/**
 * The prepare manager provides functionality to upload content to the GPU
 * @class
 * @memberof PIXI
 * @param renderer {PIXI.WebGLRenderer} A reference to the current renderer
 */
function Prepare(renderer)
{
    /**
     * Reference to the renderer.
     * @type {PIXI.WebGLRenderer}
     * @private
     */
    this.renderer = renderer;

    /**
     * Collection of items to uploads at once.
     * @type {Array<*>}
     * @private
     */
    this.queue = [];

    /**
     * Collection of additional hooks for finding assets.
     * @type {Array<Function>}
     * @private
     */
    this.addHooks = [];

    /**
     * Collection of additional hooks for processing assets.
     * @type {Array<Function>}
     * @private
     */
    this.uploadHooks = [];

    /**
     * Callback to call after completed.
     * @type {Function}
     * @private
     */
    this.complete = null;

    // Add textures and graphics to upload
    this.register(findBaseTextures, uploadBaseTextures)
        .register(findGraphics, uploadGraphics);
}

/**
 * The number of graphics or textures to upload to the GPU
 * @property {int} UPLOADS_PER_FRAME
 * @static
 * @default 4
 */
Prepare.UPLOADS_PER_FRAME = 4;

Prepare.prototype.constructor = Prepare;
module.exports = Prepare;

/** 
 * Upload all the textures and graphics to the GPU. 
 * @method upload
 * @param {Function|PIXI.DisplayObject|PIXI.Container} item Either
 *        the container or display object to search for items to upload or
 *        the callback function, if items have been added using `prepare.add`.
 * @param {Function} done When completed
 */
Prepare.prototype.upload = function(item, done)
{
    if (typeof item === 'function')
    {
        done = item;
        item = null;
    }

    // If a display object, search for items
    // that we could upload
    if (item)
    {
        this.add(item);
    }

    // Get the items for upload from the display
    if (this.queue.length)
    {
        this.numLeft = Prepare.UPLOADS_PER_FRAME;
        this.complete = done;
        SharedTicker.add(this.tick, this);
    }
    else
    {
        done();
    }
};

/**
 * Handle tick update
 * @method tick
 * @private
 */
Prepare.prototype.tick = function()
{
    // Upload the graphics
    while(this.queue.length && this.numLeft > 0)
    {
        var item = this.queue[0];
        var uploaded = false;
        for (var i = 0, len = this.uploadHooks.length; i < len; i++)
        {
            if (this.uploadHooks[i](this.renderer, item))
            {
                this.numLeft--;
                this.queue.shift();
                uploaded = true;
                break;
            }
        }
        if (!uploaded)
        {
            this.queue.shift();
        }
    }

    // We're finished
    if (this.queue.length)
    {
        this.numLeft = Prepare.UPLOADS_PER_FRAME;
    } 
    else 
    {
        SharedTicker.remove(this.tick, this);
        var done = this.complete;
        this.complete = null;
        done();
    }
};

/**
 * Adds hooks for finding and uploading items.
 * @method register
 * @param {Function} [addHook] Function call that takes two parameters: `item:*, queue:Array`
          function must return `true` if it was able to add item to the queue.
 * @param {Function} [uploadHook] Function call that takes two parameters: `renderer:WebGLRenderer, item:*` and
 *        function must return `true` if it was able to handle upload of item.
 * @return {PIXI.webgl.Prepare} Instance of plugin for chaining.
 */
Prepare.prototype.register = function(addHook, uploadHook)
{
    if (addHook)
    {
        this.addHooks.push(addHook);
    }
    if (uploadHook) 
    {
        this.uploadHooks.push(uploadHook);
    }
    return this;
};

/**
 * Manually add an item to the uploading queue.
 * @method add
 * @param {PIXI.DisplayObject|PIXI.Container|*} item 
 * @return {PIXI.webgl.Prepare} Instance of plugin for chaining.
 */
Prepare.prototype.add = function(item)
{
    var i, len; 

    // Add additional hooks for finding elements on special
    // types of objects that 
    for (i = 0, len = this.addHooks.length; i < len; i++)
    {
        if (this.addHooks[i](item, this.queue))
        {
            break;
        }
    }

    // Get childen recursively
    if (item instanceof core.Container)
    {
        for (i = item.children.length - 1; i >= 0; i--)
        {
            this.add(item.children[i]);
        }
    }
    return this;
};

/**
 * Built-in hook to upload PIXI.Texture objects to the GPU
 * @method uploadBaseTextures
 * @private
 * @param {*} item Item to check
 * @return {Boolean} If item was uploaded.
 */
function uploadBaseTextures(renderer, item)
{
    if (item instanceof core.BaseTexture)
    {
        renderer.textureManager.updateTexture(item);
        return true;
    }
    return false;
}

/**
 * Built-in hook to upload PIXI.Graphics to the GPU
 * @method uploadGraphics
 * @private
 * @param {*} item Item to check
 * @return {Boolean} If item was uploaded.
 */
function uploadGraphics(renderer, item)
{
    if (item instanceof core.Graphics)
    {
        renderer.plugins.graphics.updateGraphics(item);
        return true;
    }
    return false;
}

/**
 * Built-in hook to find textures from Sprites
 * @method findTextures
 * @private
 * @param {PIXI.DisplayObject} item Display object to check
 * @param {Array<*>} queue Collection of items to upload
 * @return {Boolean} if a PIXI.Texture object was found.
 */
function findBaseTextures(item, queue)
{
    // Objects with textures, like Sprites/Text
    if (item instanceof core.BaseTexture)
    {
        if (queue.indexOf(item) === -1)
        {
            queue.push(item);
        }
        return true;
    }
    else if (item._texture && item._texture instanceof core.Texture)
    {
        var texture = item._texture.baseTexture;
        if (queue.indexOf(texture) === -1)
        {
            queue.push(texture);
        }
        return true;
    }
    return false;
}

/**
 * Built-in hook to find graphics
 * @method findGraphics
 * @private
 * @param {PIXI.DisplayObject} item Display object to check
 * @param {Array<*>} queue Collection of items to upload
 * @return {Boolean} if a PIXI.Graphics object was found.
 */
function findGraphics(item, queue)
{
    if (item instanceof core.Graphics)
    {
        queue.push(item);
        return true;
    }
    return false;
}

core.WebGLRenderer.registerPlugin('prepare', Prepare);