// Load data tiles using the JQuery ajax function
L.TileLayer.Ajax = L.TileLayer.extend({
    _requests: [],
    _addTile: function(tilePoint, container) {
        var tile = { datum: null };
        this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;
        this._loadTile(tile, tilePoint);
    },
    _addTileData: function(tile) {
        // override in subclass
    },
    // XMLHttpRequest handler; closure over the XHR object, the layer, and the tile
    _xhrHandler: function (req, layer, tile) {
        return function() {
            if (req.readyState != 4) {
                return;
            }
            var s = req.status;
            if ((s >= 200 && s < 300) || s == 304) {
                tile.datum = JSON.parse(req.responseText);
                layer._addTileData(tile);
            } else {
                layer._tileLoaded();
            }
        }
    },
    // Load the requested tile via AJAX
    _loadTile: function (tile, tilePoint) {
        this._adjustTilePoint(tilePoint);
        var layer = this;
        var req = new XMLHttpRequest();
        this._requests.push(req);
        req.onreadystatechange = this._xhrHandler(req, layer, tile);
        req.open('GET', this.getTileUrl(tilePoint), true);
        req.send();
    },
    _reset: function() {
        for (var i in this._requests) {
            this._requests[i].abort();
        }
        this._requests = [];
        L.TileLayer.prototype._reset.apply(this, arguments);
    },
    _update: function() {
        if (this._map._panTransition && this._map._panTransition._inProgress) { return; }
        if (this._tilesToLoad < 0) this._tilesToLoad = 0;
        L.TileLayer.prototype._update.apply(this, arguments);
    }
});

L.TileLayer.Vector = L.TileLayer.Ajax.extend({
    options: {
        layerFactory: L.geoJson
    },
    initialize: function (url, options, vectorOptions) {
        L.TileLayer.Ajax.prototype.initialize.call(this, url, options);
        this.vectorOptions = vectorOptions || {};
    },
    onAdd: function (map) {
        this._map = map;
        L.TileLayer.Ajax.prototype.onAdd.call(this, map);
        this.on('tileunload', this._unloadTile);
        // root vector layer, contains tile vector layers as children 
        this.vectorLayer = this._createVectorLayer(); 
        map.addLayer(this.vectorLayer);

        // workaround for v0.5.1:
        // Error in projectLatlngs because L.Path._map is null, when layer has been removed 
        // in the same viewreset event (tileunload) and listeners are not removed yet.
        // Not needed for current master (> v0.5.1), because listeners are removed immediately.
        // 
        // Simply removes viewreset listeners right after they have been added, assuming that 
        // we always remove layers on viewreset and therefore projectLatlngs is unnecessary. 
        map.on('layeradd', this._removeViewresetForPaths, this);
    },
    onRemove: function (map) {
        // unload tiles (L.TileLayer only calls _reset in onAdd)
        this._reset();
        map.removeLayer(this.vectorLayer);

        L.TileLayer.Ajax.prototype.onRemove.call(this, map);

        this.off('tileunload', this._unloadTile);
        map.off('layeradd', this._removeViewresetForPaths, this);

        this.vectorLayer = null;
        this._map = null;
    },
    _createVectorLayer: function() {
        return this.options.layerFactory(null, this.vectorOptions);
    },
    _removeViewresetForPaths: function(evt) {
        var layer = evt.layer;
        if (layer.projectLatlngs && this._map) {
            this._map.off('viewreset', layer.projectLatlngs, layer);
        }
    },
    _createTileLayer: function() {
        return this._createVectorLayer();
    },
    _addTileData: function(tile) {
        try {
            var tileLayer = this._createTileLayer();
            tileLayer.addData(tile.datum);
            tile.layer = tileLayer;
            this.vectorLayer.addLayer(tileLayer);
        } catch (e) {
            console.error(e.toString());
        }
        this._tileLoaded();
    },
    _unloadTile: function(evt) {
        var tileLayer = evt.tile.layer;
        if (tileLayer) {
            // L.LayerGroup.hasLayer > v0.5.1 only 
            if (this.vectorLayer._layers[L.stamp(tileLayer)]) {
                this.vectorLayer.removeLayer(tileLayer);
            }
        }
    }
});
