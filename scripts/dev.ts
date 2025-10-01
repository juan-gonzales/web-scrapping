import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const electronPath = require('electron') as string;
const tsNodeRegister = require.resolve('ts-node/register');
const mainPath = path.join(__dirname, '..', 'src', 'electron.main.ts');
const tscPath = require.resolve('typescript/bin/tsc');

let electronProcess: ChildProcess | undefined;
let tscProcess: ChildProcess | undefined;

function startTsc() {
  tscProcess = spawn(process.execPath, [tscPath, '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env,
  });
}

function startElectron() {
  electronProcess = spawn(electronPath, ['-r', tsNodeRegister, mainPath], {
    stdio: 'inherit',
    env: process.env,
  });
  electronProcess.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.error(`Electron exited with code ${code}`);
    }
  });
}

process.on('SIGINT', () => {
  electronProcess?.kill('SIGINT');
  tscProcess?.kill('SIGINT');
  process.exit();
});

startTsc();
startElectron();
