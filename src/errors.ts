export class ArgumentMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentMapError';
  }
}

export class ValidationError extends ArgumentMapError {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}
