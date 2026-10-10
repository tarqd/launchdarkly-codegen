/** The java target's own config keys (DESIGN.md → java → Config). */

import { targetOption } from '@launchtarqly/core';
import { JAVA_IDENTIFIER, JAVA_RESERVED_WORDS } from './naming.js';

export const OPTIONS = {
  package: targetOption({
    type: 'string',
    required: true,
    description: "The generated file's `package`: dot-separated Java identifiers, none a reserved word.",
    example: 'com.example.flags',
    parse: (pkg, fail) => {
      for (const segment of pkg.split('.')) {
        if (!JAVA_IDENTIFIER.test(segment) || JAVA_RESERVED_WORDS.has(segment)) {
          fail(
            `must be dot-separated Java identifiers, each matching [A-Za-z_$][A-Za-z0-9_$]* and not a reserved word, got ${JSON.stringify(pkg)}`,
          );
        }
      }
      return pkg;
    },
  }),
};
