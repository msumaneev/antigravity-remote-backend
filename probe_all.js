// Probe MORE methods on the live Language Server
const https = require('https');
const { execSync } = require('child_process');

function findLS() {
  const result = execSync('wmic process where "name=\'language_server.exe\'" get CommandLine /VALUE', { encoding: 'utf8' });
  const csrfMatch = result.match(/csrf[_-]?token[=\s]+([a-f0-9-]+)/i);
  const pid = execSync('wmic process where "name=\'language_server.exe\'" get ProcessId /VALUE', { encoding: 'utf8' });
  const pidMatch = pid.match(/ProcessId=(\d+)/);
  const netstat = execSync(`netstat -ano | findstr "${pidMatch[1]}" | findstr "LISTENING"`, { encoding: 'utf8' });
  const portMatch = netstat.match(/:(\d+)\s+.*LISTENING/);
  return { csrf: csrfMatch[1], port: parseInt(portMatch[1]) };
}

function makeRequest(port, csrf, method, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: '127.0.0.1', port, method: 'POST',
      path: `/exa.language_server_pb.LanguageServerService/${method}`,
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': csrf,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d.substring(0, 200) }); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  const ls = findLS();
  console.log('LS:', ls);
  
  // All methods extracted from binary (cleaned up)
  const methods = [
    // Cascade / Agent
    'GetCascadeTrajectory',
    'GetCascadeTrajectorySteps', 
    'GetCascadeTrajectoryExecutorMetadatas',
    'GetCascadeTrajectoryGeneratorMetadata',
    'InitializeCascadePanelState',
    'CancelCascadeInvocation',
    'CancelCascadeSteps',
    'ForceStopCascadeTree',
    'RevertToCascadeStep',
    'DeleteCascadeTrajectory',
    'DeleteAgentMessage',
    'DeleteQueuedUserInputStep',
    'SendUserCascadeMessage',
    'SendAgentMessage',
    'SendAllQueuedMessages',
    'SendStepsToBackground',
    'SendActionToChatPanel',
    'ConvertTrajectoryToMarkdown',
    'ForkConversation',
    'LoadTrajectory',
    'LoadReplayConversation',
    'ResolveOutstandingSteps',
    'AcknowledgeCascadeCodeEdit',
    'AcknowledgeCodeActionStep',
    'RequestAgentStatePageUpdate',
    'StartCascade',
    'WaitForConversationFullyIdle',
    'GetTurnDiff',
    'GetPatchAndCodeChange',
    'GetArtifactSnapshots',
    'GetRevisionArtifact',
    
    // Models
    'GetAvailableModels',
    'GetCascadeModelConfigs',
    'GetCascadeModelConfigData',
    'GetCommandModelConfigs',
    'GetModelStatuses',
    'GetModelResponse',
    
    // Files / Workspace
    'ReadFile',
    'WriteFile',
    'ReadDir',
    'DeleteFileOrDirectory',
    'StatUri',
    'SearchFiles',
    'SearchCode',
    'ResolveFolder',
    'GetWorkingDirectories',
    'SetWorkingDirectories',
    'GetWorkspaceInfos',
    'AddTrackedWorkspace',
    'RemoveTrackedWorkspace',
    'GetWorkspaceEditState',
    'WatchDirectory',
    'ResolveWorkspaceUrlPreview',
    
    // Git / VCS
    'GetVersionControlState',
    'WatchVersionControlState',
    'GetVersionControlFileContent',
    'GetRepoInfos',
    'GenerateCommitMessage',
    'FigCommit',
    'FigSync',
    'FigUpload',
    'FigAmend',
    'CheckoutWorktree',
    'CreateWorktree',
    'DeleteWorktree',
    'GetWorktreeDiff',
    'UpdatePRForWorktree',
    'GetCodeFrequencyForRepo',
    
    // MCP
    'GetMcpServerStates',
    'ToggleMcpServer',
    'RefreshMcpServers',
    'GetMcpServerTemplates',
    'ListMcpPrompts',
    'ListMcpResources',
    'GetMcpPrompt',
    'CompleteMcpOAuth',
    'DisconnectMcpOAuth',
    
    // Projects
    'CreateProject',
    'DeleteProject',
    'UpdateProject',
    'ValidateProject',
    'GetDefaultProjectDir',
    'CreateScratchProjectFolder',
    'AddEnvironmentToProject',
    'ImportProjectFromUrl',
    
    // User / Auth
    'GetUserStatus',
    'GetLocalUserInfo',
    'FetchUserInfo',
    'GetProfileData',
    'GetAuthStatus',
    'LoginWithBrowser',
    'RegisterGdmUser',
    'MigrateApiKey',
    
    // Customization / Skills / Plugins
    'GetAllSkills',
    'GetAllRules',
    'GetAllWorkflows',
    'GetAllPlugins',
    'GetSlashCommands',
    'GetAllCustomAgentConfigs',
    'CreateCustomizationFile',
    'UpdateCustomization',
    'UpdateCustomizationPathsFile',
    'ListCustomizationPathsByFile',
    'ScanSkillsConfigFile',
    'GetSkillMarketplaceLink',
    'InstallCascadePlugin',
    'DeletePlugin',
    'GetAvailableCascadePlugins',
    'GetCascadePluginById',
    'GetBuildWithGooglePlugins',
    
    // Memory
    'GetCascadeMemories',
    'UpdateCascadeMemory',
    'DeleteCascadeMemory',
    'GetUserMemories',
    
    // Conversation metadata
    'GetConversationMetadata',
    'UpdateConversationAnnotations',
    'SearchConversations',
    'SmartFocusConversation',
    'GetUserTrajectory',
    'GetUserTrajectoryDescriptions',
    
    // Jetbox
    'JetboxDeleteSummary',
    'JetboxGetLatestVersion',
    'JetboxSubscribeToState',
    'JetboxWriteState',
    'JetboxWriteSummary',
    
    // Recording / Media
    'StartScreenRecording',
    'SaveScreenRecording',
    'HandleScreenRecording',
    'SaveMediaAsArtifact',
    'DeleteMediaArtifact',
    'CaptureScreenshot',
    'CaptureConsoleLogs',
    
    // Audio
    'StartAudioSession', // guessed
    'EndAudioSession',
    'SendAudioChunk',
    'GetTranscription',
    
    // Browser
    'SmartOpenBrowser',
    'AddToBrowserWhitelist',
    'GetAllBrowserWhitelistedUrls',
    'GetBrowserWhitelistFilePath',
    'GetBrowserOpenConversation',
    'SetBrowserOpenConversation',
    'CheckDevToolsActivePort',
    'SkipBrowserSubagent',
    
    // Terminal
    'RunCommand',
    'HandleStreamingCommand',
    
    // Battle Mode
    'StartBattleMode',
    'EndBattleMode',
    'EliminateBattleModeArm',
    'DetectBattleModeAutoTrigger',
    
    // Diagnostics / Telemetry
    'GetDebugDiagnostics',
    'GetStatus',
    'Heartbeat',
    'DumpFlightRecorder',
    'DumpPprof',
    'RecordError',
    'RecordEvent',
    'RecordAnalyticsEvent',
    'GetSidecarEvents',
    'GetSidecarLogs',
    'ListSidecarLogFiles',
    'GetSidecars',
    'ManageSidecar',
    'SubscribeToSidecars',
    'GetStaticExperimentStatus',
    'GetUnleashData',
    'GetUserAnalyticsSummary',
    
    // Settings / Config
    'GetUserSettings',
    'SetUserSettings',
    'SetBaseExperiments',
    'UpdateDevExperiments',
    'SetOrVerifyStaticConfig',
    'GetTeamOrganizationalControls',
    'GetMendelFlags',
    'GetChangelog',
    'WellSupportedLanguages',
    
    // Misc
    'Exit',
    'Restart',
    'CreateTrajectoryShare',
    'ImportFromCursor',
    'ForceBackgroundResearchRefresh',
    'RefreshContextForIdeAction',
    'GetMatchingContextScopeItems',
    'GetKnowledgeItems',
    'GetWebDocsOptions',
    'GetCodeValidationStates',
    'ResetOnboarding',
    'SkipOnboarding',
    'SignalExecutableIdle',
    'FocusUserPage',
    'ListPages',
    'ListProfiles',
    'GetStandaloneDir',
    'ReconnectExtensionServer',
    'SetCloudCodeURL',
    'GetCascadeNuxes',
    'GetAgentTeamMetadata',
    'GenerateEnvironmentName',
    'SetupUniversitySandbox',
    'GetTokenBase',
    'RecordChatFeedback',
  ];
  
  const results = { ok: [], error: [], timeout: [] };
  
  for (const method of methods) {
    try {
      const r = await makeRequest(ls.port, ls.csrf, method);
      const isError = r.data && r.data.code && !['', 'unknown', 'invalid_argument', 'unimplemented'].includes('');
      const hasData = r.data && typeof r.data === 'object' && !r.data.code;
      const summary = JSON.stringify(r.data).substring(0, 150);
      
      if (r.data.code) {
        results.error.push({ method, code: r.data.code, msg: (r.data.message || '').substring(0, 80) });
      } else {
        results.ok.push({ method, summary });
      }
    } catch (e) {
      results.timeout.push({ method, error: e.message });
    }
  }
  
  console.log(`\n=== WORKING METHODS (${results.ok.length}) ===`);
  for (const r of results.ok) {
    console.log(`✅ ${r.method}: ${r.summary}`);
  }
  
  console.log(`\n=== ERRORS (${results.error.length}) ===`);
  for (const r of results.error) {
    console.log(`⚠️  ${r.method} [${r.code}]: ${r.msg}`);
  }
  
  console.log(`\n=== TIMEOUTS/STREAMING (${results.timeout.length}) ===`);
  for (const r of results.timeout) {
    console.log(`⏳ ${r.method}: ${r.error}`);
  }
}

main().catch(console.error);
