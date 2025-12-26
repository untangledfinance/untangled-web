/**
 * Returns basic information of the application.
 */
export function useAppInfo() {
  const env = Configs.env.ENV;
  const appName = Configs.app.name;
  const appDescription = Configs.app.description;
  const appLink = Configs.app.url;
  const appRegistry = Configs.app.registry;
  const appVersion = Configs.app.version;
  const systemName = Configs.system.name;
  const systemIcon = Configs.app.icon;
  return {
    env,
    appName,
    appDescription,
    appLink,
    appRegistry,
    appVersion,
    systemName,
    systemIcon,
  };
}

/**
 * Returns information of the application in Slack format.
 */
useAppInfo.forSlack = () => {
  const appInfo = useAppInfo();
  const appLink = `*<${appInfo.appLink}|${appInfo.appName}>*`;
  const appVersionLink = `*<${appInfo.appRegistry}/${appInfo.appName}|${appInfo.appVersion}>*`;
  return {
    ...appInfo,
    appLink,
    appVersionLink,
  };
};
