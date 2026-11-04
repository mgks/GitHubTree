import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubTree } from '../index.js';

describe('GitHubTree Core', () => {
    const gt = new GitHubTree();

    const sampleTree = [
        { path: 'src', type: 'tree', mode: '040000', sha: '1' },
        { path: 'src/index.js', type: 'blob', mode: '100644', sha: '2', size: 100 },
        { path: 'src/utils.js', type: 'blob', mode: '100644', sha: '3', size: 250 },
        { path: 'src/assets', type: 'tree', mode: '040000', sha: '4' },
        { path: 'src/assets/logo.png', type: 'blob', mode: '100644', sha: '5', size: 1024 },
        { path: 'package.json', type: 'blob', mode: '100644', sha: '6', size: 50 },
        { path: 'README.md', type: 'blob', mode: '100644', sha: '7', size: 500 }
    ];

    test('sortTree orders folders before files by default (folder-az)', () => {
        const sorted = gt.sortTree(sampleTree, 'folder-az');
        assert.ok(sorted.length === sampleTree.length);
        const topLevelPaths = sorted.filter(item => !item.path.includes('/'));
        // Top level has 'src', 'package.json', 'README.md'
        // 'src' (folder) must come before files
        assert.equal(topLevelPaths[0].path, 'src');
    });

    test('sortTree filters by depth', () => {
        const depth1 = gt.sortTree(sampleTree, 'folder-az', { depth: 1 });
        assert.ok(depth1.every(item => !item.path.includes('/')));
        assert.equal(depth1.length, 3); // src, README.md, package.json
    });

    test('sortTree filters by ignore patterns', () => {
        const ignored = gt.sortTree(sampleTree, 'folder-az', { ignore: ['*.png', 'README*'] });
        assert.ok(!ignored.some(item => item.path.endsWith('.png')));
        assert.ok(!ignored.some(item => item.path === 'README.md'));
    });

    test('generateAsciiTree produces correct tree structure', () => {
        const ascii = gt.generateAsciiTree(sampleTree);
        assert.ok(typeof ascii === 'string');
        assert.ok(ascii.includes('src/'));
        assert.ok(ascii.includes('index.js'));
        assert.ok(ascii.includes('├──') || ascii.includes('└──'));
    });

    test('generateAsciiTree outputs JSON when requested', () => {
        const jsonStr = gt.generateAsciiTree(sampleTree, { json: true });
        const parsed = JSON.parse(jsonStr);
        assert.equal(parsed.length, sampleTree.length);
    });

    test('getTreeStats computes correct totals', () => {
        const stats = gt.getTreeStats(sampleTree);
        assert.equal(stats.totalDirs, 2); // src, src/assets
        assert.equal(stats.totalFiles, 5);
        assert.equal(stats.totalBytes, 100 + 250 + 1024 + 50 + 500);
        assert.equal(stats.extensions['js'], 2);
        assert.equal(stats.extensions['png'], 1);
        assert.equal(stats.extensions['json'], 1);
        assert.equal(stats.extensions['md'], 1);
    });
});
