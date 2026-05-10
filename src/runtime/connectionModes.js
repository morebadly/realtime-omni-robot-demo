export const CONNECTION_MODE_OPTIONS = [
  {
    key: 'wifi_cloud',
    label: 'Wi-Fi 云端',
    description: '家庭/办公室主体验',
    networkLabel: 'Wi-Fi / Cloud Omni',
    productScenario: 'home',
    adapterMode: 'wifi_cloud',
    requiresNetwork: true
  },
  {
    key: 'cellular_cloud',
    label: '蜂窝云端',
    description: 'eSIM / 实体 SIM 移动体验',
    networkLabel: 'eSIM / Physical SIM Cloud',
    productScenario: 'mobile',
    adapterMode: 'cellular_cloud',
    requiresNetwork: true
  },
  {
    key: 'local_dev',
    label: '本地调试',
    description: 'LocalDev Omni Adapter',
    networkLabel: 'Wi-Fi / Local Dev',
    productScenario: 'development',
    adapterMode: 'local_dev',
    requiresNetwork: true
  },
  {
    key: 'self_hosted_cloud',
    label: '自建云',
    description: 'Self-hosted Omni Gateway',
    networkLabel: 'Wi-Fi / Self-hosted Cloud',
    productScenario: 'private_cloud',
    adapterMode: 'self_hosted_cloud',
    requiresNetwork: true
  },
  {
    key: 'offline_pet',
    label: '离线宠物',
    description: '无网络基础能力',
    networkLabel: 'Offline Pet Engine',
    productScenario: 'offline',
    adapterMode: 'offline_pet',
    requiresNetwork: false
  }
];

export function getConnectionModeOption(mode) {
  return CONNECTION_MODE_OPTIONS.find((option) => option.key === mode) || CONNECTION_MODE_OPTIONS[0];
}

export function getConnectionNetworkLabel(mode) {
  return getConnectionModeOption(mode).networkLabel;
}
