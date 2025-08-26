--[[ 
    Roblox Game Explorer Client - INCREMENTAL UPDATES (HTTP VERSION)
    ----------------------------------------------------------------
    Uses HTTP API to send ONLY changed data
    Optimized for 100K+ objects with minimal network usage.

    Place this script in ServerScriptService.
]]

-- Dependencies
local RunService = game:GetService('RunService')

-- Configuration
local SERVER_URL = "https://your-replit-app-url.replit.app" -- Replace with your actual Replit URL
local UPDATE_INTERVAL = 0.1 -- seconds (MAXIMUM SPEED updates)
local BATCH_SIZE = 2000 -- MASSIVE batches for absolute max speed

-- State
local isConnected = false
local isSending = false
local lastUpdate = 0
local isFirstSync = true
local previousInstances = {}
local previousInstanceHashes = {}

--==============================================================
-- JSON Encoding
--==============================================================
local function escapeString(str)
    str = string.gsub(str, "\\", "\\\\")
    str = string.gsub(str, '"', '\\"')
    str = string.gsub(str, "\n", "\\n")
    str = string.gsub(str, "\r", "\\r")
    str = string.gsub(str, "\t", "\\t")
    return str
end

local function isArray(tbl)
    local count = 0
    for k, v in pairs(tbl) do
        count = count + 1
        if type(k) ~= "number" or k ~= count then
            return false
        end
    end
    return true
end

local function jsonEncode(data)
    if type(data) == "table" then
        if isArray(data) then
            -- Encode as array
            local result = "["
            local first = true
            for i, value in ipairs(data) do
                if not first then
                    result = result .. ","
                end
                first = false
                result = result .. jsonEncode(value)
            end
            result = result .. "]"
            return result
        else
            -- Encode as object
            local result = "{"
            local first = true
            for key, value in pairs(data) do
                if not first then
                    result = result .. ","
                end
                first = false
                
                if type(key) == "string" then
                    result = result .. '"' .. escapeString(key) .. '":'
                else
                    result = result .. '"' .. tostring(key) .. '":'
                end
                
                result = result .. jsonEncode(value)
            end
            result = result .. "}"
            return result
        end
    elseif type(data) == "string" then
        return '"' .. escapeString(data) .. '"'
    elseif type(data) == "number" then
        return tostring(data)
    elseif type(data) == "boolean" then
        return data and "true" or "false"
    elseif data == nil then
        return "null"
    else
        return '"' .. escapeString(tostring(data)) .. '"'
    end
end

--==============================================================
-- HTTP Request Helper
--==============================================================
local function sendHttpRequest(endpoint, data)
    local success, response = pcall(function()
        return request({
            Url = SERVER_URL .. endpoint,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["Accept-Encoding"] = "gzip" -- Enable compression
            },
            Body = jsonEncode(data or {}),
            Timeout = 60 -- Extended timeout for larger batches
        })
    end)
    
    if success and response.Success then
        return response.Body
    else
        warn("✗ Failed to send to " .. endpoint .. ": " .. tostring(response))
    end
    
    return nil
end

--==============================================================
-- Hashing and Change Detection
--==============================================================
local function createHash(instanceData)
    local hashString = instanceData.name
        .. '|'
        .. instanceData.className
        .. '|'
        .. instanceData.parent
    for k, v in pairs(instanceData.properties) do
        if k ~= 'Name' and k ~= 'ClassName' and k ~= 'Parent' then
            hashString = hashString .. '|' .. k .. ':' .. tostring(v)
        end
    end
    local hash = 0
    for i = 1, #hashString do
        hash = ((hash * 31) + string.byte(hashString, i)) % 2147483647
    end
    return hash
end

local function instancesAreEqual(inst1, inst2)
    if not inst1 or not inst2 then
        return false
    end
    return createHash(inst1) == createHash(inst2)
end

--==============================================================
-- Instance Data Collection
--==============================================================
local function createInstanceData(instance, parentPath)
    local path = parentPath and (parentPath .. '.' .. instance.Name)
        or 'game.' .. instance.Name
    
    -- Minimal properties to reduce processing time
    local properties = {
        Name = instance.Name,
        ClassName = instance.ClassName,
    }

    -- MAXIMUM properties collection - server can handle big datasets
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
        properties.Source = string.sub(instance.Source or "", 1, 100) -- First 100 chars
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

local function collectChildrenOptimized(parent, parentPath, instances, depth)
    depth = depth or 0
    
    -- MAXIMUM depth since server can handle anything
    if depth > 20 then
        return
    end
    
    local children = parent:GetChildren()
    for i, child in ipairs(children) do
        local inst = createInstanceData(child, parentPath)
        table.insert(instances, inst)
        
        -- Include all objects since server can handle big datasets now
        collectChildrenOptimized(child, inst.path, instances, depth + 1)
        
        -- MAXIMUM SPEED yielding - only yield when absolutely necessary
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
        'Workspace',
        'Players',
        'ReplicatedStorage',
        'ServerStorage',
        'Lighting',
        'StarterGui',
        'StarterPack',
        'StarterPlayer',
        'SoundService',
        'TweenService',
        'Teams',
        'Chat',
        'HttpService',
        'RunService',
        'UserInputService',
    }

    for _, name in ipairs(services) do
        local ok, service = pcall(function()
            return game:GetService(name)
        end)
        if ok and service then
            local serviceData = createInstanceData(service, 'game')

            -- Service-specific properties
            if name == 'Workspace' then
                serviceData.properties.Gravity = service.Gravity
                serviceData.properties.CurrentCamera = service.CurrentCamera
                        and service.CurrentCamera.Name
                    or 'nil'
            elseif name == 'Lighting' then
                serviceData.properties.Brightness = service.Brightness
                serviceData.properties.TimeOfDay = service.TimeOfDay
                serviceData.properties.Ambient = tostring(service.Ambient)
            elseif name == 'Players' then
                serviceData.properties.MaxPlayers = service.MaxPlayers
                serviceData.properties.NumPlayers = service.NumPlayers
            end

            table.insert(instances, serviceData)
            collectChildrenOptimized(service, 'game.' .. name, instances, 0)
        end
    end

    return instances
end

--==============================================================
-- Change Detection
--==============================================================
local function detectChanges(currentInstances)
    local changes = { added = {}, modified = {}, removed = {} }
    local currentByPath = {}
    
    for _, inst in ipairs(currentInstances) do
        currentByPath[inst.path] = inst
    end
    
    for path, currentInst in pairs(currentByPath) do
        local previousInst = previousInstances[path]
        if not previousInst then
            table.insert(changes.added, currentInst)
        elseif not instancesAreEqual(currentInst, previousInst) then
            table.insert(changes.modified, currentInst)
        end
    end
    
    for path, _ in pairs(previousInstances) do
        if not currentByPath[path] then
            table.insert(changes.removed, path)
        end
    end
    
    return changes
end

--==============================================================
-- HTTP Sending Functions
--==============================================================
local function sendGameTreeBatch(instances, batchIndex, totalBatches)
    local batchData = {
        instances = instances,
        batchIndex = batchIndex,
        totalBatches = totalBatches,
        isLastBatch = (batchIndex == totalBatches - 1)
    }
    return sendHttpRequest("/api/game-tree-batch", batchData)
end

local function sendIncrementalUpdate(added, modified, removed)
    local data = {
        added = added or {},
        modified = modified or {},
        removed = removed or {}
    }
    return sendHttpRequest("/api/incremental-update", data)
end

local function sendPing()
    return sendHttpRequest("/api/ping", {})
end

--==============================================================
-- Main Update Loop
--==============================================================
local function sendIncrementalUpdates()
    if isSending then
        return
    end
    isSending = true

    local ok, err = pcall(function()
        local currentInstances = collectCurrentGameData()

        if isFirstSync then
            print("🚀 Starting initial sync with " .. #currentInstances .. " instances")
            
            -- Send ping to establish connection
            sendPing()
            
            -- Send in batches for large datasets
            local totalBatches = math.ceil(#currentInstances / BATCH_SIZE)
            
            for batchIndex = 0, totalBatches - 1 do
                local startIdx = batchIndex * BATCH_SIZE + 1
                local endIdx = math.min((batchIndex + 1) * BATCH_SIZE, #currentInstances)
                local batchInstances = {}
                
                for i = startIdx, endIdx do
                    table.insert(batchInstances, currentInstances[i])
                end
                
                sendGameTreeBatch(batchInstances, batchIndex, totalBatches)
                task.wait(0.05) -- MAXIMUM SPEED - minimal delay
            end
            
            print("✅ Initial sync completed!")
            isFirstSync = false
            isConnected = true
        else
            -- Incremental updates
            local changes = detectChanges(currentInstances)
            local totalChanges = #changes.added + #changes.modified + #changes.removed
            
            if totalChanges > 0 then
                print("📊 Sending incremental update: " .. #changes.added .. " added, " .. 
                      #changes.modified .. " modified, " .. #changes.removed .. " removed")
                sendIncrementalUpdate(changes.added, changes.modified, changes.removed)
            end
        end

        -- Update previous state
        previousInstances = {}
        for _, inst in ipairs(currentInstances) do
            previousInstances[inst.path] = inst
        end
    end)

    if not ok then
        warn("❌ Error in sendIncrementalUpdates: " .. tostring(err))
    end

    isSending = false
end

--==============================================================
-- Main Loop
--==============================================================
local function startIncrementalUpdates()
    print("🎮 Starting Roblox Game Explorer (HTTP Incremental Mode)")
    
    -- Initial ping
    sendPing()
    
    -- Start update loop
    spawn(function()
        while true do
            local currentTime = tick()
            if currentTime - lastUpdate >= UPDATE_INTERVAL then
                sendIncrementalUpdates()
                lastUpdate = currentTime
            end
            task.wait(0.1)
        end
    end)
    
    -- Periodic ping every 30 seconds
    spawn(function()
        while true do
            task.wait(30)
            if isConnected then
                sendPing()
            end
        end
    end)
end

-- Start the system
startIncrementalUpdates()

print("✅ Incremental HTTP Game Explorer Client Started!")
print("📡 Server: " .. SERVER_URL)
print("⏱️  Update Interval: " .. UPDATE_INTERVAL .. " seconds")
print("📦 Batch Size: " .. BATCH_SIZE .. " instances")

return {
    sendPing = sendPing,
    sendIncrementalUpdate = sendIncrementalUpdate,
    collectCurrentGameData = collectCurrentGameData,
    detectChanges = detectChanges
}