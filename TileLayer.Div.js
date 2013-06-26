L.TileLayer.Div = L.TileLayer.extend({

    initialize: function (options) {
        L.TileLayer.prototype.initialize.call(this, null, options);
    },

    _createTileProto: function () {
        this._proto = L.DomUtil.create('div', 'leaflet-tile leaflet-tile-loaded');

        var tileSize = this.options.tileSize;
        this._proto.style.width = tileSize + 'px';
        this._proto.style.height = tileSize + 'px';
    },

    _createTile: function () {
        var tile = this._proto.cloneNode(false);
        tile.onselectstart = tile.onmousemove = L.Util.falseFn;
        return tile;        
    },

    _loadTile: function (tile, tilePoint) {
        tile._layer = this;
        tile._tilePoint = tilePoint;
        this._adjustTilePoint(tilePoint);
        
        this.drawTile(tile, tilePoint)
        
        this._tileLoaded();
    },
    
    drawTile: function (tile, tilePoint) {
        // override with rendering code
    }
});
