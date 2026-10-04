const fs = require('fs');
const path = require('path');

class ProjectManager {
  constructor(baseDir = '/home/qqqqdh/dual-agent-studio/projects') {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  createProjectDir(projectName) {
    const cleanName = projectName
      .replace(/[^a-zA-Z0-9_\-\uac00-\ud7a3]/g, '_')
      .slice(0, 30) || 'project';
    const timestamp = Date.now().toString().slice(-4);
    const folderName = `${cleanName}_${timestamp}`;
    const projectPath = path.join(this.baseDir, folderName);
    fs.mkdirSync(projectPath, { recursive: true });
    return {
      folderName,
      projectPath
    };
  }

  getFileTree(dir, rootDir = dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
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
    const safePath = path.join(projectPath, relativeFilePath);
    if (!safePath.startsWith(projectPath)) {
      throw new Error('Path traversal detected');
    }
    if (!fs.existsSync(safePath)) {
      return null;
    }
    const stat = fs.statSync(safePath);
    if (stat.size > 1024 * 1024) {
      return '파일 크기가 1MB를 초과하여 미리보기를 지원하지 않습니다.';
    }
    return fs.readFileSync(safePath, 'utf8');
  }

  writeFile(projectPath, relativeFilePath, content) {
    const targetPath = path.join(projectPath, relativeFilePath);
    if (!targetPath.startsWith(projectPath)) {
      throw new Error('Path traversal detected');
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
  }
}

module.exports = new ProjectManager();
