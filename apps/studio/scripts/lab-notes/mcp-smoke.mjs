#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const dataRoot = process.env.LAB_NOTES_DATA_DIR ?? path.resolve('.aphex/lab-notes-eval');
const apiKey = (
	await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8').catch(() => '')
).trim();
assert.ok(apiKey, 'Run lab-notes:bootstrap-key after first signup');

const init = await fetch(`${base}/mcp`, {
	method: 'POST',
	headers: { 'x-api-key': apiKey, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
	body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } }, id: 1 })
});
assert.equal(init.status, 200);
const tools = await fetch(`${base}/mcp`, {
	method: 'POST',
	headers: { 'x-api-key': apiKey, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
	body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 })
});
assert.equal(tools.status, 200);
const text = await tools.text();
assert.match(text, /describe_cms|get_document|preview_draft_url/);
console.log(JSON.stringify({ ok: true, base }));
