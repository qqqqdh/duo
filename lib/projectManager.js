const fs = require('fs');
const path = require('path');

class ProjectManager {
  constructor(baseDir = path.join(__dirname, '..', 'projects')) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  createProjectDir(projectName) {
    const cleanName = projectName
      .replace(/[^a-zA-Z0-9_\-\uac00-\ud7a3]/g, '_')
      .slice(0, 30) || 'project';
    const projectPath = fs.mkdtempSync(path.join(this.baseDir, `${cleanName}_`));
    const folderName = path.basename(projectPath);
    return {
      folderName,
      projectPath
    };
  }

  resolveProject(name) {
    if (typeof name !== 'string' || !name || name === '.' || name === '..' ||
        name.includes('/') || name.includes('\\') || path.basename(name) !== name) {
      throw new Error('잘못된 프로젝트 이름입니다.');
    }
    const projectPath = path.join(this.baseDir, name);
    try {
      const stat = fs.lstatSync(projectPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid');
      const base = fs.realpathSync(this.baseDir);
      const real = fs.realpathSync(projectPath);
      if (path.dirname(real) !== base) throw new Error('invalid');
      return projectPath;
    } catch {
      throw new Error('프로젝트를 찾을 수 없습니다.');
    }
  }

  listProjects() {
    return fs.readdirSync(this.baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const projectPath = this.resolveProject(entry.name);
        const snapshot = this.loadSnapshot(projectPath);
        return {
          name: entry.name,
          path: projectPath,
          mtime: fs.statSync(projectPath).mtime,
          prompt: snapshot?.session?.prompt || ''
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  loadSnapshot(projectPath) {
    try {
      return JSON.parse(fs.readFileSync(path.join(projectPath, '.duo-session.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  saveSnapshot(projectPath, snapshot) {
    this.resolveProject(path.basename(projectPath));
    const target = path.join(projectPath, '.duo-session.json');
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(snapshot), 'utf8');
    fs.renameSync(temporary, target);
  }

  getFileTree(dir, rootDir = dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        tree.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children: this.getFileTree(fullPath, rootDir)
        });
      } else {
        const stats = fs.statSync(fullPath);
        tree.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stats.size,
          mtime: stats.mtime
        });
      }
    }
    return tree;
  }

  readFileContent(projectPath, relativeFilePath) {
    if (typeof relativeFilePath !== 'string' || !relativeFilePath) {
      throw new Error('Invalid file path');
    }
    const root = fs.realpathSync(projectPath);
    const safePath = path.resolve(root, relativeFilePath);
    const relative = path.relative(root, safePath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Path traversal detected');
    }
    if (!fs.existsSync(safePath)) {
      return null;
    }
    const realPath = fs.realpathSync(safePath);
    const realRelative = path.relative(root, realPath);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
      throw new Error('Path traversal detected');
    }
    const stat = fs.statSync(safePath);
    if (!stat.isFile()) return null;
    if (stat.size > 1024 * 1024) {
      return '파일 크기가 1MB를 초과하여 미리보기를 지원하지 않습니다.';
    }
    return fs.readFileSync(safePath, 'utf8');
  }
}

module.exports = new ProjectManager();
