import type { PageServerLoad } from "./$types";

import { getProjectPaths } from "$lib/server/project";

export const load: PageServerLoad = async () => {
  console.log("load page");

  const projectPaths = await getProjectPaths(
    "/Users/mika/Code/",
    // Any extra repos not detected by getProjectPaths filters...
    []
  );

  return {
    projectPaths,
  };
};
