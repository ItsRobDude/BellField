export function createRegisterAddLineGate() {
  let isAdding = false;

  return {
    isAdding() {
      return isAdding;
    },
    async run(action: () => Promise<boolean>): Promise<boolean> {
      if (isAdding) {
        return false;
      }

      isAdding = true;
      try {
        return await action();
      } finally {
        isAdding = false;
      }
    }
  };
}
