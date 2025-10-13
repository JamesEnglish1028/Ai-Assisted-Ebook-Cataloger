"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
console.log('✅ Imported @google/genai successfully');
var app = (0, express_1.default)();
var PORT = 3002;
app.get('/test', function (req, res) {
    console.log('✅ Test endpoint hit!');
    res.json({ status: 'ok', message: 'Test with @google/genai import works!' });
});
var server = app.listen(PORT, '0.0.0.0', function () {
    console.log("\uD83D\uDE80 Minimal server running on http://localhost:".concat(PORT));
    console.log("\uD83D\uDCDA Test endpoint: http://localhost:".concat(PORT, "/test"));
    console.log('✅ Server is actually listening!');
});
server.on('error', function (err) {
    console.error('❌ Server error:', err);
});
