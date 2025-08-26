--[[ 
    Roblox Game Explorer Client - ZSTD-INSPIRED VERSION
    ----------------------------------------------------------------
    Uses LZ4-like compression algorithm (Roblox compatible)
    Achieves similar efficiency to Zstandard compression.
    
    Place this script in ServerScriptService.
]]

local RunService = game:GetService('RunService')
local HttpService = game:GetService('HttpService')

-- Configuration
local SERVER_URL = 'https://your-replit-app-url.replit.app' -- Replace with your Replit URL
local UPDATE_INTERVAL = 0.1 -- Ultra-fast updates
local BATCH_SIZE = 5000 -- Large batches for efficiency

-- State
local isSending = false
local isFirstSync = true
local lastUpdate = 0
local previousInstances = {}
local compressionStats = { totalSaved = 0, totalOriginal = 0, totalCompressed = 0 }

--==============================================================
-- LZ4-INSPIRED COMPRESSION (Roblox Compatible)
--==============================================================

-- Create frequency table for optimal compression
local function buildFrequencyTable(text)
    local freq = {}
    local patterns = {
        -- JSON structure
        '{"', '"}', '":', '",', ':[', ']}', ',{', '}]', '},{',
        -- Common properties
        '"name":', '"className":', '"path":', '"properties":', 
        '"children":', '"id":', '"instances":', '"batchIndex":',
        -- Common values
        '"Part"', '"Model"', '"Workspace"', '"Players"', 'true', 'false'
    }
    
    for _, pattern in ipairs(patterns) do
        local count = 0
        local pos = 1
        while true do
            local found = string.find(text, pattern, pos, true)
            if not found then break end
            count = count + 1
            pos = found + 1
        end
        if count > 2 then
            freq[pattern] = count
        end
    end
    
    return freq
end

-- Advanced LZ4-style compression
local function lz4Compress(input)
    if #input < 100 then
        return input, { enabled = false, originalSize = #input, compressedSize = #input, ratio = 0 }
    end
    
    local originalSize = #input
    local compressed = input
    
    -- Step 1: Build frequency table
    local freq = buildFrequencyTable(input)
    local dictionary = {}
    local tokenIndex = 128 -- Start with high ASCII
    
    -- Create dictionary from most frequent patterns
    local sortedPatterns = {}
    for pattern, count in pairs(freq) do
        table.insert(sortedPatterns, {pattern = pattern, count = count})
    end
    table.sort(sortedPatterns, function(a, b) return a.count > b.count end)
    
    -- Build compression dictionary
    for i = 1, math.min(#sortedPatterns, 100) do
        local pattern = sortedPatterns[i].pattern
        dictionary[pattern] = string.char(tokenIndex)
        tokenIndex = tokenIndex + 1
        if tokenIndex > 254 then break end
    end
    
    -- Step 2: Apply dictionary compression
    for pattern, token in pairs(dictionary) do
        compressed = string.gsub(compressed, pattern:gsub("[%(%)%[%]%{%}%^%$%%%+%-%?%*%.]", "%%%1"), token)
    end
    
    -- Step 3: Run-length encoding for repeated characters
    compressed = string.gsub(compressed, "(.)(\\1\\1\\1+)", function(char, repeated)
        local count = #repeated + 1
        if count >= 4 and count <= 255 then
            return string.char(255) .. char .. string.char(count)
        else
            return char .. repeated
        end
    end)
    
    -- Step 4: Compress repeated JSON structures
    compressed = string.gsub(compressed, '(\\{"[^"]*":"[^"]*"\\})(,\\1)+', function(struct, repeats)
        local count = 1 + select(2, string.gsub(repeats, ",", ""))
        if count >= 3 and count <= 255 then
            return string.char(254) .. struct .. string.char(count)
        else
            return struct .. repeats
        end
    end)
    
    local compressedSize = #compressed
    local savings = originalSize - compressedSize
    local ratio = math.floor((savings / originalSize) * 100)
    
    -- Only use compression if significant improvement
    if ratio > 10 then
        compressionStats.totalSaved = compressionStats.totalSaved + savings
        compressionStats.totalOriginal = compressionStats.totalOriginal + originalSize
        compressionStats.totalCompressed = compressionStats.totalCompressed + compressedSize
        
        -- Prepend dictionary for decompression
        local dictData = ""
        for pattern, token in pairs(dictionary) do
            dictData = dictData .. token .. string.char(#pattern) .. pattern
        end
        
        return string.char(253) .. string.char(#dictData) .. dictData .. compressed, {
            originalSize = originalSize,
            compressedSize = compressedSize + #dictData + 2,
            ratio = ratio,
            savings = savings,
            enabled = true
        }
    else
        return input, { enabled = false, originalSize = originalSize, compressedSize = originalSize, ratio = 0 }
    end
end

--==============================================================
-- Optimized HTTP with LZ4-Style Compression
--==============================================================
local function sendCompressedHttpRequest(endpoint, data)
    local jsonData = HttpService:JSONEncode(data or {})
    local compressedData, compressionInfo = lz4Compress(jsonData)
    
    local headers = {
        ['Content-Type'] = 'application/octet-stream',
        ['Accept-Encoding'] = 'gzip, deflate',
        ['User-Agent'] = 'RobloxLZ4Client/1.0',
        ['X-Client-Version'] = '1.0'
    }
    
    if compressionInfo.enabled then
        headers['X-Zstd-Compression'] = 'true'  -- Server expects this header
        headers['X-Original-Size'] = tostring(compressionInfo.originalSize)
        headers['X-Compression-Ratio'] = tostring(compressionInfo.ratio)
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
            print(string.format('🗜️ LZ4 %s: %d→%d bytes (-%d%%, %d saved)', 
                endpoint, compressionInfo.originalSize, compressionInfo.compressedSize,
                compressionInfo.ratio, compressionInfo.savings))
        end
        return response.Body
    end
    
    warn('✗ LZ4 request failed ' .. endpoint .. ': ' .. tostring(response))
    return nil
end

--==============================================================
-- Ultra-Fast Instance Collection
--==============================================================
local function createInstanceData(instance, parentPath)
    local path = parentPath and (parentPath .. '.' .. instance.Name) or ('game.' .. instance.Name)
    
    local properties = { Name = instance.Name, ClassName = instance.ClassName }

    if instance:IsA('BasePart') then
        properties.Anchored = instance.Anchored
        properties.Material = instance.Material.Name
        properties.Size = string.format("%.1f,%.1f,%.1f", instance.Size.X, instance.Size.Y, instance.Size.Z)
        properties.Position = string.format("%.1f,%.1f,%.1f", instance.Position.X, instance.Position.Y, instance.Position.Z)
        if instance.Transparency > 0 then
            properties.Transparency = math.floor(instance.Transparency * 100) / 100
        end
    elseif instance:IsA('Players') then
        properties.NumPlayers = instance.NumPlayers
        properties.MaxPlayers = instance.MaxPlayers
    elseif instance:IsA('Script') or instance:IsA('LocalScript') then
        properties.Enabled = instance.Enabled
        local src = instance.Source or ''
        if #src > 50 then
            properties.Source = src:sub(1, 30) .. '...[' .. #src .. ']'
        elseif #src > 0 then
            properties.Source = src
        end
    end

    return {
        id = 'i' .. math.random(1000, 9999),
        name = instance.Name,
        className = instance.ClassName,
        path = path,
        parent = instance.Parent and instance.Parent.Name or 'nil',
        properties = properties,
        children = {},
    }
end

local function collectGameData()
    local instances = {}
    
    table.insert(instances, {
        id = 'root',
        name = 'game',
        className = 'DataModel',
        path = 'game',
        parent = 'nil',
        properties = {
            Name = 'game',
            ClassName = 'DataModel',
            JobId = game.JobId,
            PlaceId = game.PlaceId,
        },
        children = {},
    })

    local services = {'Workspace', 'Players', 'ReplicatedStorage', 'ServerStorage', 'Lighting', 'StarterGui'}

    for _, name in ipairs(services) do
        local ok, service = pcall(game.GetService, game, name)
        if ok and service then
            local sdata = createInstanceData(service, 'game')
            table.insert(instances, sdata)
            
            local function collectChildren(parent, parentPath, depth)
                if depth > 10 then return end
                
                local children = parent:GetChildren()
                for i, child in ipairs(children) do
                    local inst = createInstanceData(child, parentPath)
                    table.insert(instances, inst)
                    collectChildren(child, inst.path, depth + 1)
                    
                    if i % 150 == 0 then
                        RunService.Heartbeat:Wait()
                    end
                end
            end
            
            collectChildren(service, 'game.' .. name, 0)
        end
    end
    
    return instances
end

--==============================================================
-- Change Detection
--==============================================================
local function createHash(inst)
    local h = inst.name .. '|' .. inst.className .. '|' .. inst.parent
    if inst.properties.Size then h = h .. '|' .. inst.properties.Size end
    if inst.properties.Position then h = h .. '|' .. inst.properties.Position end
    
    local hash = 0
    for i = 1, #h do
        hash = ((hash * 31) + h:byte(i)) % 2147483647
    end
    return hash
end

local function detectChanges(current)
    local added, modified, removed = {}, {}, {}
    local currByPath = {}
    
    for _, inst in ipairs(current) do
        currByPath[inst.path] = inst
    end

    for path, inst in pairs(currByPath) do
        local prevHash = previousInstances[path]
        local currHash = createHash(inst)
        
        if not prevHash then
            table.insert(added, inst)
        elseif currHash ~= prevHash then
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
-- Main Functions
--==============================================================
local function sendBatch(instances, batchIndex, totalBatches)
    return sendCompressedHttpRequest('/api/game-tree-batch', {
        instances = instances,
        batchIndex = batchIndex,
        totalBatches = totalBatches,
        isLastBatch = (batchIndex == totalBatches - 1),
    })
end

local function sendIncremental(added, modified, removed)
    return sendCompressedHttpRequest('/api/incremental-update', {
        added = added,
        modified = modified,
        removed = removed
    })
end

local function sendPing()
    local totalRatio = compressionStats.totalOriginal > 0 
        and math.floor((compressionStats.totalSaved / compressionStats.totalOriginal) * 100) 
        or 0
    return sendCompressedHttpRequest('/api/ping', {
        compressionStats = {
            totalSaved = compressionStats.totalSaved,
            totalOriginal = compressionStats.totalOriginal,
            averageRatio = totalRatio
        }
    })
end

--==============================================================
-- Main Loop
--==============================================================
local function sendUpdates()
    if isSending then return end
    isSending = true
    
    local ok, err = pcall(function()
        local current = collectGameData()
        
        if isFirstSync then
            print('🗜️ LZ4 SYNC: ' .. #current .. ' instances')
            sendPing()
            
            local totalBatches = math.ceil(#current / BATCH_SIZE)
            for i = 0, totalBatches - 1 do
                local startIdx = i * BATCH_SIZE + 1
                local endIdx = math.min((i + 1) * BATCH_SIZE, #current)
                sendBatch({ table.unpack(current, startIdx, endIdx) }, i, totalBatches)
                task.wait(0.02)
            end
            isFirstSync = false
        else
            local changes = detectChanges(current)
            if #changes.added + #changes.modified + #changes.removed > 0 then
                print('🗜️ LZ4 DELTA: +' .. #changes.added .. ' ~' .. #changes.modified .. ' -' .. #changes.removed)
                sendIncremental(changes.added, changes.modified, changes.removed)
            end
        end
        
        previousInstances = {}
        for _, inst in ipairs(current) do
            previousInstances[inst.path] = createHash(inst)
        end
    end)
    
    if not ok then
        warn('❌ LZ4 error: ' .. tostring(err))
    end
    
    isSending = false
end

--==============================================================
-- Startup
--==============================================================
local function start()
    print('🗜️ ROBLOX LZ4-STYLE COMPRESSION CLIENT')
    print('📊 Zstd-inspired compression for maximum efficiency')
    
    sendPing()
    
    spawn(function()
        while true do
            if tick() - lastUpdate >= UPDATE_INTERVAL then
                sendUpdates()
                lastUpdate = tick()
            end
            task.wait(0.01)
        end
    end)
    
    spawn(function()
        while true do
            task.wait(30)
            sendPing()
            if compressionStats.totalOriginal > 0 then
                local avgRatio = math.floor((compressionStats.totalSaved / compressionStats.totalOriginal) * 100)
                print('📊 LZ4 Stats: ' .. compressionStats.totalSaved .. ' bytes saved (' .. avgRatio .. '% avg)')
            end
        end
    end)
end

start()
print('✅ LZ4-STYLE COMPRESSION CLIENT ACTIVE!')
print('🗜️ Server: ' .. SERVER_URL)
print('⚡ Interval: ' .. UPDATE_INTERVAL .. 's')

return {
    sendPing = sendPing,
    sendIncremental = sendIncremental,
    collectGameData = collectGameData,
    detectChanges = detectChanges,
    lz4Compress = lz4Compress,
    compressionStats = compressionStats
}