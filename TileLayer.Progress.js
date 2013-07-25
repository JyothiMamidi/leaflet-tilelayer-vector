/*
 * Loading progress info layer for L.TileLayer.Vector
 */
L.TileLayer.Progress = L.TileLayer.Div.extend({
    _adding: false,
    
    initialize: function (vectorLayer) {
        L.TileLayer.Div.prototype.initialize.call(this, vectorLayer.options);

        this.vectorLayer = vectorLayer;
    },

    onAdd: function (map) {
        this._adding = true;
        map.on('viewreset', this._updateZoom, this);
        map.on('layerremove', this._onVecRemove, this);
        this.vectorLayer.on('tileloading', this._onTileLoading, this);
        this.vectorLayer.on('tileload', this._onTileLoad, this);
        this.vectorLayer.on('tileerror', this._onTileError, this);
        L.TileLayer.Div.prototype.onAdd.apply(this, arguments);
        this._adding = false;
    },

    onRemove: function (map) {
        L.TileLayer.Div.prototype.onRemove.apply(this, arguments);
        this.vectorLayer.off('tileloading', this._onTileLoading, this);
        this.vectorLayer.off('tileload', this._onTileLoad, this);
        this.vectorLayer.off('tileerror', this._onTileError, this);
        map.off('viewreset', this._updateZoom, this);
    },

    drawTile: function (tile, tilePoint) {
        var vecTile, loading;
        tile.style.backgroundColor = 'rgba(128, 128, 128, 0.3)';
        tile.style.border = '1px solid rgba(128, 128, 128, 0.8)';
        tile.style.boxSizing = 'border-box';

        if (this._adding) {
            vecTile = this.vectorLayer._tiles[tilePoint.x + ':' + tilePoint.y];
            loading = vecTile && vecTile.loading;
            if (!loading) {
                // hide tiles when adding layer and vector tiles already loaded 
                this._hide(tile);
            }
        }
    },

    _updateZoom: function() {
        if (this.options.tileSize != this.vectorLayer.options.tileSize) {
            this.options.tileSize = this.vectorLayer.options.tileSize;
            this.options.zoomOffset = this.vectorLayer.options.zoomOffset;
        }
    },

    _onVecRemove: function(evt) {
        if (evt.layer === this.vectorLayer) {
            this._hideAll();
        }
    },

    _hideAll: function() {
        for (var key in this._tiles) {
            var tile = this._tiles[key];
            this._hide(tile);
        }
    },

    _onTileLoading: function(evt) {
        var tile = this._tiles[evt.tile.key];
        this._show(tile);
    },

    _onTileLoad: function(evt) {
        var tile = this._tiles[evt.tile.key];
        this._hide(tile);
    },

    _onTileError: function(evt) {
        var tile = this._tiles[evt.tile.key];
        if (tile) {
            tile.style.backgroundColor = 'rgba(128, 128, 128, 0.7)';
            tile.style.border = 'none';
        }
    },
    
    _show: function(tile) {
        if (tile) {
            tile.classList.add('leaflet-tile-loaded');
        }
    },
    
    _hide: function(tile) {
        if (tile) {
            tile.classList.remove('leaflet-tile-loaded');
        }
    }
});

