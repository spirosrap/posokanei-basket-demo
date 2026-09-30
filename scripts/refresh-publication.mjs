export async function publishRefreshTargets({
  targets,
  publishCatalog,
  publishImages,
  onMirrorError,
  onImageError,
}) {
  const publishedTargets = [];
  for (const target of targets) {
    try {
      await publishCatalog(target);
      publishedTargets.push(target);
    } catch (error) {
      if (target.required) throw error;
      onMirrorError(target, error);
    }
  }

  // Neither site's prices should wait for optional image maintenance.
  for (const target of publishedTargets) {
    try {
      await publishImages(target);
    } catch (error) {
      onImageError(target, error);
    }
  }
}
