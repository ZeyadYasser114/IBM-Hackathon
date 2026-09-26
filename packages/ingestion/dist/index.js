"use strict";
/**
 * @mergemind/ingestion — public API
 *
 * Everything a downstream consumer needs is exported from this single file.
 * Internal helpers (parse.ts, providers/git.ts internals) are NOT re-exported
 * so the public surface stays stable as providers evolve.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSemanticAnalysisInput = exports.summarizeRepository = exports.extractEvidence = exports.WORKING_TREE = exports.ingestLocalGit = exports.ingestChanges = exports.compareBranches = void 0;
// ---------------------------------------------------------------------------
// Local Git provider
// ---------------------------------------------------------------------------
var git_js_1 = require("./providers/git.js");
Object.defineProperty(exports, "compareBranches", { enumerable: true, get: function () { return git_js_1.compareBranches; } });
Object.defineProperty(exports, "ingestChanges", { enumerable: true, get: function () { return git_js_1.ingestChanges; } });
Object.defineProperty(exports, "ingestLocalGit", { enumerable: true, get: function () { return git_js_1.ingestLocalGit; } });
Object.defineProperty(exports, "WORKING_TREE", { enumerable: true, get: function () { return git_js_1.WORKING_TREE; } });
// ---------------------------------------------------------------------------
// Evidence extraction
// ---------------------------------------------------------------------------
var extractor_js_1 = require("./evidence/extractor.js");
Object.defineProperty(exports, "extractEvidence", { enumerable: true, get: function () { return extractor_js_1.extractEvidence; } });
// ---------------------------------------------------------------------------
// Change summarization
// ---------------------------------------------------------------------------
var index_js_1 = require("./summary/index.js");
Object.defineProperty(exports, "summarizeRepository", { enumerable: true, get: function () { return index_js_1.summarizeRepository; } });
// ---------------------------------------------------------------------------
// Semantic analysis payload
// ---------------------------------------------------------------------------
var builder_js_1 = require("./payload/builder.js");
Object.defineProperty(exports, "buildSemanticAnalysisInput", { enumerable: true, get: function () { return builder_js_1.buildSemanticAnalysisInput; } });
//# sourceMappingURL=index.js.map