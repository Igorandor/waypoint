/** Waypoint's output projection: classify names separately from diagnostic text. */
export function credentialField(name: string) {
  const words = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    words.includes('password') ||
    words.includes('token') ||
    words.includes('privatekey') ||
    words.endsWith('secret') ||
    words.endsWith('secrets') ||
    words === 'walletsecretconfig' ||
    words.includes('hotpkey')
  );
}
export function credentialValues(root: unknown, sensitive = false): string[] {
  const found: string[] = [];
  const visit = (value: unknown, protectedBranch: boolean) => {
    if (typeof value === 'string') {
      if (protectedBranch && value.length) found.push(value);
      return;
    }
    if (value && typeof value === 'object')
      for (const [name, child] of Object.entries(value))
        visit(child, protectedBranch || credentialField(name));
  };
  visit(root, sensitive);
  return found;
}
export function redact(root: any, secrets: readonly string[] = []): any {
  const choices = [...new Set(secrets)].filter((s) => s.length).sort((a, b) => b.length - a.length);
  // Literal scanner avoids regex interpretation and never revisits a replacement marker.
  const mask = (text: string) => {
    if (!choices.length) return text;
    let output = '',
      offset = 0;
    while (offset < text.length) {
      let start = text.length,
        match = '';
      for (const secret of choices) {
        const i = text.indexOf(secret, offset);
        if (i >= 0 && (i < start || (i === start && secret.length > match.length))) {
          start = i;
          match = secret;
        }
      }
      if (!match) return output + text.slice(offset);
      output += text.slice(offset, start) + '[redacted]';
      offset = start + match.length;
    }
    return output;
  };
  const project = (value: any): any => {
    if (typeof value === 'string') return mask(value);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(project);
    const entries = Object.entries(value).map(([name, item]) => {
      // These exact native user fields describe policy, not credential values.
      const policy =
        typeof item === 'boolean' &&
        ['ChangePassword', 'PasswordNeverExpires', 'HOTPKeyDisplay'].includes(name);
      return [name, credentialField(name) && !policy ? '[redacted]' : project(item)];
    });
    return Object.fromEntries(entries);
  };
  return project(root);
}
