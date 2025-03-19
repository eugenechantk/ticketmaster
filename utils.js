export const withTimeoutAndInfiniteRetry = async (
  action,
  { actionName, timeout = 3000, page, reload = true }
) => {
  const tryAction = async () => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`${actionName}: Operation timed out after ${timeout}ms`)
        );
      }, timeout);
    });

    return Promise.race([action(), timeoutPromise]);
  };

  while (true) {
    try {
      await tryAction();
      console.log(`${actionName}: Success!`);
      return; // Exit the loop and function on success
    } catch (error) {
      console.log(`${actionName}: ${error.message}`);
      if (page) {
        if (reload) {
          console.log(`${actionName}: Refreshing page and retrying...`);
          await page.reload();
        } else {
          console.log(`${actionName}: Retrying...`);
        }
      } else {
        throw error; // If no page object, can't retry
      }
    }
  }
};
