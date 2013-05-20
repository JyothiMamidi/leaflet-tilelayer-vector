// XHR for binary data (responseType arraybuffer)
// TODO add as option to L.TileLayer.Ajax? 
L.TileLayer.Ajax.include({
    // XMLHttpRequest handler; closure over the XHR object, the layer, and the tile
    _xhrHandler: function (req, layer, tile) {
        return function() {
            if (req.readyState != 4) {
                return;
            }
            var s = req.status;
            // status 0 + response check for file:// URLs
            if (((s >= 200 && s < 300) || s == 304) || (s == 0 && req.response)) {
                tile.datum = req.response;
                layer._addTileData(tile);
            } else {
                layer._tileLoaded();
            }
        }
    },
    // Load the requested tile via AJAX
    _loadTile: function (tile, tilePoint) {
        var layer = this;
        var req = new XMLHttpRequest();
        this._requests.push(req);
        req.onreadystatechange = this._xhrHandler(req, layer, tile);
        req.open('GET', this.getTileUrl(tilePoint), true);
        req.responseType = 'arraybuffer';
        req.send();
    }
});