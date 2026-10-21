import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DaemonClient } from '../daemon/client';

suite('Extension Smoke Tests', () => {
  suiteSetup(async function () {
    // Activation may auto-start the bundled SEA and wait for IPC readiness.
    this.timeout(60000);

    // Clear stale runtime artifacts so a dead PID / leftover socket cannot
    // confuse liveness checks or leave activate() waiting on a bad endpoint.
    const runtimeDir = path.join(os.tmpdir(), 'abbenay');
    for (const name of ['abbenay.pid', 'daemon.sock', 'daemon.addr']) {
      const p = path.join(runtimeDir, name);
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch {
        // best-effort cleanup
      }
    }

    const ext = vscode.extensions.getExtension('redhat.abbenay-provider');
    if (ext && !ext.isActive) {
      try {
        await ext.activate();
      } catch (err) {
        console.error('Extension activation error (expected without daemon):', err);
      }
    }
  });

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('redhat.abbenay-provider');
    assert.ok(ext, 'Extension not found in registry');
  });

  test('Extension should activate without crashing', () => {
    const ext = vscode.extensions.getExtension('redhat.abbenay-provider');
    assert.ok(ext);
    assert.strictEqual(ext.isActive, true, 'Extension should be active (even without daemon)');
  });

  test('Contributed commands should be registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);

    const expected = [
      'abbenay.daemonStatus',
      'abbenay.openDashboard',
      'abbenay.configureProvider',
      'abbenay.chat.newSession',
      'abbenay.chat.deleteSession',
      'abbenay.chat.settings',
      'abbenay.chat.send',
      'abbenay.setDaemonToken',
      'abbenay.clearDaemonToken',
    ];

    for (const cmd of expected) {
      assert.ok(
        allCommands.includes(cmd),
        `Expected command "${cmd}" to be registered`,
      );
    }
  });

  test('Chat view should be registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(
      allCommands.includes('abbenay.chatView.focus'),
      'Expected chat view focus command to be auto-registered',
    );
  });

  test('Configuration section should exist', () => {
    const config = vscode.workspace.getConfiguration('abbenay');
    const logLevel = config.get<string>('logLevel');
    assert.strictEqual(logLevel, 'info', 'Default logLevel should be "info"');
    assert.strictEqual(config.get<string>('daemonMode'), 'auto');
    assert.strictEqual(config.get<string>('daemonAddress'), '');
    assert.strictEqual(config.get<boolean>('daemonTls'), true);
    assert.strictEqual(config.get<string>('daemonSslTargetName'), 'abbenay-grpc');
  });

  test('disabled daemon mode does not spawn or connect to a daemon', async () => {
    await vscode.workspace.getConfiguration('abbenay').update('daemonMode', 'disabled', vscode.ConfigurationTarget.Global);

    const client = new DaemonClient();
    try {
      await assert.rejects(client.connect(), /Abbenay is disabled by the abbenay\.daemonMode setting/);
      assert.strictEqual(client.isConnected(), false);
    } finally {
      await client.close();
      await vscode.workspace.getConfiguration('abbenay').update('daemonMode', 'auto', vscode.ConfigurationTarget.Global);
    }
  });
});
