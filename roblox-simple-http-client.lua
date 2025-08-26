--[[ 
    Roblox Game Explorer Client - SIMPLE HTTP VERSION
    ----------------------------------------------------------------
    Uses HTTP API without compression for maximum compatibility.
    Optimized and efficient without the complexity of compression.
    
    Place this script in ServerScriptService.
]]

local RunService = game:GetService('RunService')

-- Configuration
local SERVER_URL = 'https://your-replit-app-url.replit.app' -- Replace with your Replit URL
local UPDATE_INTERVAL = 0.2 -- seconds (reasonable speed)
local BATCH_SIZE = 1000 -- Smaller batches for reliability

-- State
local isSending = false
local isFirstSync = true
local lastUpdate = 0
local previousInstances = {}

--==============================================================
-- JSON Encoder (Reliable)
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
-- HTTP Helper (Simple and Reliable)
--==============================================================
local function sendHttpRequest(endpoint, data)
    local success, response = pcall(function()
        return request({
            Url = SERVER_URL .. endpoint,
            Method = 'POST',
            Headers = {
                ['Content-Type'] = 'application/json',
                ['User-Agent'] = 'RobloxHTTPClient/1.0-Simple'
            },
            Body = jsonEncode(data or {}),
            Timeout = 30,
        })
    end)
    
    if success and response.Success then
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

    -- Add key properties based on instance type
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
        -- Truncate source for performance
        properties.Source = (instance.Source or ''):sub(1, 50)
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

local function collectChildren(parent, parentPath, out, depth)
    depth = depth or 0
    if depth > 15 then -- Reasonable depth limit
        return
    end
    
    local children = parent:GetChildren()
    for i, child in ipairs(children) do
        local data = createInstanceData(child, parentPath)
        table.insert(out, data)
        collectChildren(child, data.path, out, depth + 1)
        
        -- Yield occasionally for performance
        if i % 200 == 0 then
            RunService.Heartbeat:Wait()
        end
    end
end

local function collectCurrentGameData()
    local instances = {}
    
    -- Add game root
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

    -- Collect main services
    local services = {
        'Workspace', 'Players', 'ReplicatedStorage', 'ServerStorage',
        'Lighting', 'StarterGui', 'StarterPack', 'StarterPlayer'
    }

    for _, name in ipairs(services) do
        local ok, service = pcall(game.GetService, game, name)
        if ok and service then
            local sdata = createInstanceData(service, 'game')
            
            -- Add service-specific properties
            if name == 'Workspace' then
                sdata.properties.Gravity = service.Gravity
            elseif name == 'Lighting' then
                sdata.properties.Brightness = service.Brightness
                sdata.properties.TimeOfDay = service.TimeOfDay
            elseif name == 'Players' then
                sdata.properties.NumPlayers = service.NumPlayers
                sdata.properties.MaxPlayers = service.MaxPlayers
            end
            
            table.insert(instances, sdata)
            collectChildren(service, 'game.' .. name, instances, 0)
        end
    end
    
    return instances
end

--==============================================================
-- Change Detection (Simplified)
--==============================================================
local function createHash(inst)
    local h = inst.name .. '|' .. inst.className .. '|' .. inst.parent
    for k, v in pairs(inst.properties) do
        h = h .. '|' .. k .. ':' .. tostring(v)
    end
    return h
end

local function detectChanges(current)
    local added, modified, removed = {}, {}, {}
    local currByPath = {}
    local currHashes = {}
    
    for _, inst in ipairs(current) do
        currByPath[inst.path] = inst
        currHashes[inst.path] = createHash(inst)
    end

    for path, inst in pairs(currByPath) do
        local prevHash = previousInstances[path]
        if not prevHash then
            table.insert(added, inst)
        elseif currHashes[path] ~= prevHash then
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
-- HTTP Sending Functions
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
    return sendHttpRequest('/api/ping', {})
end

--==============================================================
-- Main Update Loop
--==============================================================
local function sendUpdates()
    if isSending then
        return
    end
    isSending = true
    
    local ok, err = pcall(function()
        local current = collectCurrentGameData()
        
        if isFirstSync then
            print('🚀 Initial sync: ' .. #current .. ' instances')
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
                task.wait(0.1) -- Reasonable delay between batches
            end
            isFirstSync = false
        else
            local changes = detectChanges(current)
            if #changes.added + #changes.modified + #changes.removed > 0 then
                print(
                    '📊 Incremental: '
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
        
        -- Update previous state with hashes
        previousInstances = {}
        for _, inst in ipairs(current) do
            previousInstances[inst.path] = createHash(inst)
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
    print('🎮 Roblox Game Explorer HTTP Client (Simple & Reliable)')
    sendPing()
    
    -- Main update loop
    spawn(function()
        while true do
            if tick() - lastUpdate >= UPDATE_INTERVAL then
                sendUpdates()
                lastUpdate = tick()
            end
            task.wait(0.05)
        end
    end)
    
    -- Ping every 30 seconds
    spawn(function()
        while true do
            task.wait(30)
            sendPing()
        end
    end)
end

start()
print(
    '✅ Simple HTTP Explorer Started!\n📡 Server: '
        .. SERVER_URL
        .. '\n⏱️ Interval: '
        .. UPDATE_INTERVAL
        .. 's\n📦 Batch: '
        .. BATCH_SIZE
)

return {
    sendPing = sendPing,
    sendIncrementalUpdate = sendIncrementalUpdate,
    collectCurrentGameData = collectCurrentGameData,
    detectChanges = detectChanges
}