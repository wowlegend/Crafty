/** Reload the page: the last step of every world switch (game/worldBoot.js switchWorld). Its own module so a gate can
 *  stand in for the reload and run the next page's boot itself. */
export function reloadPage() {
  window.location.reload();
}
