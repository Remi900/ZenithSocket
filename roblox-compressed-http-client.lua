--[[ 
    Roblox Game Explorer Client - COMPRESSED HTTP VERSION
    ----------------------------------------------------------------
    Uses HTTP API with built-in compression to reduce bandwidth usage.
    Optimized for massive datasets with minimal network overhead.
    
    Place this script in ServerScriptService.
]]

local RunService = game:GetService('RunService')

-- Configuration
local SERVER_URL = 'https://your-replit-app-url.replit.app' -- Replace with your Replit URL
local UPDATE_INTERVAL = 0.1 -- seconds
local BATCH_SIZE = 3000 -- Larger batches due to compression efficiency
local COMPRESSION_ENABLED = true -- Enable/disable compression

-- State
local isSending = false
local isFirstSync = true
local lastUpdate = 0
local previousInstances = {}

--==============================================================
-- Compression Utilities
--==============================================================

-- Simple dictionary-based compression for JSON strings
local compressionDict = {
    -- Common JSON patterns
    '{"', '"}', '","', '":', '[{', '}]', '},{', 
    -- Common game object patterns
    '"name":', '"className":', '"path":', '"parent":', '"properties":', '"children":',
    '"id":', '"instances":', '"batchIndex":', '"totalBatches":',
    -- Common Roblox class names
    'BasePart', 'Model', 'Script', 'LocalScript', 'Folder', 'Part', 'MeshPart',
    'Workspace', 'Players', 'ReplicatedStorage', 'ServerStorage', 'Lighting',
    -- Common properties
    '"Anchored":', '"Material":', '"Size":', '"Position":', '"Transparency":',
    '"Name":', '"ClassName":', '"Parent":'
}

-- Build reverse dictionary for decompression
local decompressionDict = {}
for i, pattern in ipairs(compressionDict) do
    decompressionDict[string.char(128 + i)] = pattern
end

local function compressString(input)
    if not COMPRESSION_ENABLED or #input < 100 then
        return input
    end
    
    local compressed = input
    
    -- Replace common patterns with single bytes
    for i, pattern in ipairs(compressionDict) do
        local replacement = string.char(128 + i)
        compressed = string.gsub(compressed, pattern:gsub("[%(%)%[%]%{%}%^%$%%%+%-%?%*%.]", "%%%1"), replacement)
    end
    
    -- Basic run-length encoding for repeated characters
    compressed = string.gsub(compressed, "(.)%1%1+", function(char, full)
        local count = #full
        if count <= 255 then
            return string.char(255) .. char .. string.char(count)
        else
            return full -- Keep original if too long
        end
    end)
    
    -- Add compression header
    local compressionRatio = math.floor((1 - #compressed / #input) * 100)
    if compressionRatio > 10 then -- Only use if at least 10% reduction
        return "COMPRESSED_V1:" .. compressed
    else
        return input -- Return original if compression not effective
    end
end

local function getCompressionInfo(original, compressed)
    local isCompressed = string.sub(compressed, 1, 13) == "COMPRESSED_V1:"
    local originalSize = #original
    local compressedSize = isCompressed and (#compressed - 13) or #compressed
    local ratio = isCompressed and math.floor((1 - compressedSize / originalSize) * 100) or 0
    
    return {
        enabled = isCompressed,
        originalSize = originalSize,
        compressedSize = compressedSize,
        ratio = ratio,
        savings = originalSize - compressedSize
    }
end

--==============================================================
-- Enhanced JSON Encoder with Compression
--==============================================================
local function escapeString(s)
    return s:gsub('\\', '\\\\')
        :gsub('"', '\\"')
        :gsub('\n', '\\n')
        :gsub('\r', '\\r')
        :gsub('\t', '\\t')
end

local function jsonEncode(value)
    local t = type(value)
    if t == 'table' then
        local isArray = true
        local i = 0
        for k, _ in pairs(value) do
            i = i + 1
            if k ~= i then
                isArray = false
                break
            end
        end
        local parts = {}
        if isArray then
            for _, v in ipairs(value) do
                table.insert(parts, jsonEncode(v))
            end
            return '[' .. table.concat(parts, ',') .. ']'
        else
            for k, v in pairs(value) do
                table.insert(
                    parts,
                    '"' .. escapeString(tostring(k)) .. '":' .. jsonEncode(v)
                )
            end
            return '{' .. table.concat(parts, ',') .. '}'
        end
    elseif t == 'string' then
        return '"' .. escapeString(value) .. '"'
    elseif t == 'number' or t == 'boolean' then
        return tostring(value)
    else
        return 'null'
    end
end

--==============================================================
-- Enhanced HTTP Helper with Compression
--==============================================================
local function sendHttpRequest(endpoint, data)
    local jsonData = jsonEncode(data or {})
    local compressedData = compressString(jsonData)
    local compressionInfo = getCompressionInfo(jsonData, compressedData)
    
    local headers = {
        ['Content-Type'] = 'application/json',
        ['Accept-Encoding'] = 'gzip',
        ['User-Agent'] = 'RobloxHTTPClient/1.0-Compressed'
    }
    
    -- Add compression headers if data was compressed
    if compressionInfo.enabled then
        headers['X-Compression'] = 'RobloxDictionary'
        headers['X-Original-Size'] = tostring(compressionInfo.originalSize)
    end
    
    local success, response = pcall(function()
        return request({
            Url = SERVER_URL .. endpoint,
            Method = 'POST',
            Headers = headers,
            Body = compressedData,
            Timeout = 60,
        })
    end)
    
    if success and response.Success then
        if compressionInfo.enabled then
            print(string.format('📦 Compressed %s: %d → %d bytes (-%d%%, saved %d bytes)', 
                endpoint, compressionInfo.originalSize, compressionInfo.compressedSize,
                compressionInfo.ratio, compressionInfo.savings))
        end
        return response.Body
    end
    warn('✗ Failed to send to ' .. endpoint .. ': ' .. tostring(response))
    return nil
end

--==============================================================
-- Instance Data Collection (Optimized)
--==============================================================
local function createInstanceData(instance, parentPath)
    local path = parentPath and (parentPath .. '.' .. instance.Name)
        or 'game.' .. instance.Name
    
    local properties = { Name = instance.Name, ClassName = instance.ClassName }

    if instance:IsA('BasePart') then
        properties.Anchored = instance.Anchored
        properties.Material = instance.Material.Name
        properties.Size = tostring(instance.Size)
        properties.Position = tostring(instance.Position)
        properties.Transparency = instance.Transparency
    elseif instance:IsA('Players') then
        properties.NumPlayers = instance.NumPlayers
        properties.MaxPlayers = instance.MaxPlayers
    elseif instance:IsA('Script') or instance:IsA('LocalScript') then
        properties.Enabled = instance.Enabled
        properties.Source = (instance.Source or ''):sub(1, 100)
    elseif instance:IsA('Humanoid') then
        properties.Health = instance.Health
        properties.MaxHealth = instance.MaxHealth
    end

    return {
        id = 'inst_' .. math.random(1000, 9999) .. '_' .. math.floor(tick()),
        name = instance.Name,
        className = instance.ClassName,
        path = path,
        parent = instance.Parent and instance.Parent.Name or 'nil',
        properties = properties,
        children = {},
    }
end

local function collectChildren(parent, parentPath, out)
    local children = parent:GetChildren()
    for i, child in ipairs(children) do
        local data = createInstanceData(child, parentPath)
        table.insert(out, data)
        collectChildren(child, data.path, out)
        if i % 500 == 0 then
            RunService.Heartbeat:Wait()
        end
    end
end

local function collectCurrentGameData()
    local instances = {}
    table.insert(instances, {
        id = 'game_root',
        name = 'game',
        className = 'DataModel',
        path = 'game',
        parent = 'nil',
        properties = {
            Name = 'game',
            ClassName = 'DataModel',
            JobId = game.JobId,
            PlaceId = game.PlaceId,
            GameId = game.GameId,
        },
        children = {},
    })

    local services = {
        'Workspace', 'Players', 'ReplicatedStorage', 'ServerStorage',
        'Lighting', 'StarterGui', 'StarterPack', 'StarterPlayer',
        'SoundService', 'TweenService', 'Teams', 'Chat', 'HttpService',
        'RunService', 'UserInputService'
    }

    for _, name in ipairs(services) do
        local ok, service = pcall(game.GetService, game, name)
        if ok and service then
            local sdata = createInstanceData(service, 'game')
            if name == 'Workspace' then
                sdata.properties.Gravity = service.Gravity
                sdata.properties.CurrentCamera = service.CurrentCamera
                        and service.CurrentCamera.Name
                    or 'nil'
            elseif name == 'Lighting' then
                sdata.properties.Brightness = service.Brightness
                sdata.properties.TimeOfDay = service.TimeOfDay
                sdata.properties.Ambient = tostring(service.Ambient)
            elseif name == 'Players' then
                sdata.properties.NumPlayers = service.NumPlayers
                sdata.properties.MaxPlayers = service.MaxPlayers
            end
            table.insert(instances, sdata)
            collectChildren(service, 'game.' .. name, instances)
        end
    end
    return instances
end

--==============================================================
-- Change Detection with Hashing
--==============================================================
local function createHash(inst)
    local h = inst.name .. '|' .. inst.className .. '|' .. inst.parent
    for k, v in pairs(inst.properties) do
        if k ~= 'Name' and k ~= 'ClassName' and k ~= 'Parent' then
            h = h .. '|' .. k .. ':' .. tostring(v)
        end
    end
    local hash = 0
    for i = 1, #h do
        hash = ((hash * 31) + h:byte(i)) % 2147483647
    end
    return hash
end

local function instancesAreEqual(a, b)
    return a and b and createHash(a) == createHash(b)
end

local function detectChanges(current)
    local added, modified, removed = {}, {}, {}
    local currByPath = {}
    for _, inst in ipairs(current) do
        currByPath[inst.path] = inst
    end

    for path, inst in pairs(currByPath) do
        local prev = previousInstances[path]
        if not prev then
            table.insert(added, inst)
        elseif not instancesAreEqual(inst, prev) then
            table.insert(modified, inst)
        end
    end
    for path, _ in pairs(previousInstances) do
        if not currByPath[path] then
            table.insert(removed, path)
        end
    end
    return { added = added, modified = modified, removed = removed }
end

--==============================================================
-- Compressed HTTP Sending Functions
--==============================================================
local function sendBatch(instances, batchIndex, totalBatches)
    return sendHttpRequest('/api/game-tree-batch', {
        instances = instances,
        batchIndex = batchIndex,
        totalBatches = totalBatches,
        isLastBatch = (batchIndex == totalBatches - 1),
    })
end

local function sendIncrementalUpdate(added, modified, removed)
    return sendHttpRequest('/api/incremental-update', {
        added = added,
        modified = modified,
        removed = removed
    })
end

local function sendPing()
    return sendHttpRequest('/api/ping', {
        timestamp = tick(),
        compression = COMPRESSION_ENABLED
    })
end

--==============================================================
-- Main Update Loop with Compression Stats
--==============================================================
local function sendUpdates()
    if isSending then
        return
    end
    isSending = true
    local ok, err = pcall(function()
        local current = collectCurrentGameData()
        if isFirstSync then
            print('🚀 Initial compressed sync: ' .. #current .. ' instances')
            sendPing()
            local totalBatches = math.ceil(#current / BATCH_SIZE)
            for i = 0, totalBatches - 1 do
                local startIdx = i * BATCH_SIZE + 1
                local endIdx = math.min((i + 1) * BATCH_SIZE, #current)
                sendBatch(
                    { table.unpack(current, startIdx, endIdx) },
                    i,
                    totalBatches
                )
                task.wait(0.05)
            end
            isFirstSync = false
        else
            local changes = detectChanges(current)
            if #changes.added + #changes.modified + #changes.removed > 0 then
                print(
                    '📊 Compressed incremental: '
                        .. #changes.added
                        .. ' added, '
                        .. #changes.modified
                        .. ' modified, '
                        .. #changes.removed
                        .. ' removed'
                )
                sendIncrementalUpdate(
                    changes.added,
                    changes.modified,
                    changes.removed
                )
            end
        end
        previousInstances = {}
        for _, inst in ipairs(current) do
            previousInstances[inst.path] = inst
        end
    end)
    if not ok then
        warn('❌ sendUpdates error: ' .. tostring(err))
    end
    isSending = false
end

--==============================================================
-- Startup and Main Loop
--==============================================================
local function start()
    print('🎮 Roblox Game Explorer HTTP Client (Compressed)')
    print('📦 Compression: ' .. (COMPRESSION_ENABLED and 'ENABLED' or 'DISABLED'))
    sendPing()
    spawn(function()
        while true do
            if tick() - lastUpdate >= UPDATE_INTERVAL then
                sendUpdates()
                lastUpdate = tick()
            end
            task.wait(0.05)
        end
    end)
    spawn(function()
        while true do
            task.wait(30)
            if previousInstances then
                sendPing()
            end
        end
    end)
end

start()
print(
    '✅ Compressed HTTP Explorer Started!\n📡 Server: '
        .. SERVER_URL
        .. '\n⏱️ Interval: '
        .. UPDATE_INTERVAL
        .. 's\n📦 Batch: '
        .. BATCH_SIZE
        .. '\n🗜️ Compression: '
        .. (COMPRESSION_ENABLED and 'ON' or 'OFF')
)

return {
    sendPing = sendPing,
    sendIncrementalUpdate = sendIncrementalUpdate,
    collectCurrentGameData = collectCurrentGameData,
    detectChanges = detectChanges,
    compressString = compressString,
    COMPRESSION_ENABLED = COMPRESSION_ENABLED
}