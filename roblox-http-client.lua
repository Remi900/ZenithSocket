-- Roblox HTTP Client for Game Explorer
-- This replaces WebSocket with HTTP requests as requested

local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Configuration
local SERVER_URL = "https://your-replit-app-url.replit.app" -- Replace with your actual Replit URL
local BATCH_SIZE = 2500 -- Process instances in much larger batches for maximum speed

-- JSON encoding functions
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

-- HTTP Request Helper
local function sendHttpRequest(endpoint, data)
    local success, response = pcall(function()
        return request({
            Url = SERVER_URL .. endpoint,
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = jsonEncode(data or {})
        })
    end)
    
    if success and response.Success then
        print("✓ Successfully sent to " .. endpoint)
        return response.Body
    else
        warn("✗ Failed to send to " .. endpoint .. ": " .. tostring(response))
    end
    
    return nil
end

-- Send connection ping
local function sendPing()
    return sendHttpRequest("/api/ping", {})
end

-- Send single instance
local function sendInstance(action, instance, path)
    local data = {
        action = action, -- "add", "update", or "remove"
        instance = instance,
        path = path
    }
    return sendHttpRequest("/api/instance", data)
end

-- Send game tree (all instances at once)
local function sendGameTree(instances)
    local data = {
        instances = instances
    }
    return sendHttpRequest("/api/game-tree", data)
end

-- Send game tree in batches for large datasets
local function sendGameTreeBatches(instances)
    local totalBatches = math.ceil(#instances / BATCH_SIZE)
    
    for i = 1, #instances, BATCH_SIZE do
        local endIndex = math.min(i + BATCH_SIZE - 1, #instances)
        local batch = {}
        
        for j = i, endIndex do
            table.insert(batch, instances[j])
        end
        
        local batchData = {
            instances = batch,
            batchIndex = math.floor((i-1) / BATCH_SIZE),
            totalBatches = totalBatches,
            isLastBatch = endIndex == #instances
        }
        
        sendHttpRequest("/api/game-tree-batch", batchData)
        
        -- Minimal delay between batches for maximum speed
        wait(0.05)
    end
end

-- Send incremental update
local function sendIncrementalUpdate(added, modified, removed)
    local data = {
        added = added or {},
        modified = modified or {},
        removed = removed or {}
    }
    return sendHttpRequest("/api/incremental-update", data)
end

-- Convert a Roblox instance to the format expected by the server
local function convertInstance(instance, parentPath)
    local path = parentPath and (parentPath .. "." .. instance.Name) or instance.Name
    
    -- Get properties
    local properties = {}
    
    -- Safe property extraction
    local function safeGetProperty(prop)
        local success, value = pcall(function()
            return instance[prop]
        end)
        return success and value or nil
    end
    
    -- Add common properties based on instance type
    if instance:IsA("BasePart") then
        properties.Position = safeGetProperty("Position")
        properties.Size = safeGetProperty("Size")
        properties.Material = safeGetProperty("Material")
        properties.Color = safeGetProperty("Color")
        properties.Transparency = safeGetProperty("Transparency")
    elseif instance:IsA("Model") then
        properties.PrimaryPart = instance.PrimaryPart and instance.PrimaryPart.Name or nil
    end
    
    -- Add custom properties
    properties.Parent = instance.Parent and instance.Parent.Name or nil
    
    -- Get children names
    local children = {}
    for _, child in pairs(instance:GetChildren()) do
        table.insert(children, child.Name)
    end
    
    return {
        id = instance:GetDebugId(), -- Unique identifier
        name = instance.Name,
        className = instance.ClassName,
        path = path,
        parent = parentPath,
        properties = properties,
        children = children
    }
end

-- Scan entire game tree
local function scanGameTree()
    local instances = {}
    
    local function scanInstance(instance, parentPath)
        local convertedInstance = convertInstance(instance, parentPath)
        table.insert(instances, convertedInstance)
        
        -- Recursively scan children
        for _, child in pairs(instance:GetChildren()) do
            scanInstance(child, convertedInstance.path)
        end
    end
    
    -- Scan workspace
    scanInstance(game.Workspace, nil)
    
    return instances
end

-- Main execution
local function main()
    print("🚀 Starting Roblox HTTP Game Explorer Client")
    
    -- Send initial ping
    sendPing()
    
    -- Scan and send game tree
    local instances = scanGameTree()
    print("📊 Found " .. #instances .. " instances")
    
    if #instances > 1000 then
        print("📦 Using batch processing for large dataset")
        sendGameTreeBatches(instances)
    else
        print("📤 Sending all instances at once")
        sendGameTree(instances)
    end
    
    print("✅ Game tree sent successfully!")
    
    -- Set up periodic ping (every 30 seconds)
    spawn(function()
        while true do
            wait(30)
            sendPing()
        end
    end)
end

-- Example usage for real-time updates
local function setupRealTimeTracking()
    -- Track when instances are added
    game.Workspace.ChildAdded:Connect(function(child)
        local instance = convertInstance(child, "Workspace")
        sendInstance("add", instance)
    end)
    
    -- Track when instances are removed
    game.Workspace.ChildRemoved:Connect(function(child)
        local path = "Workspace." .. child.Name
        sendInstance("remove", nil, path)
    end)
    
    -- You can add more event listeners for other containers as needed
end

-- Run the main function
main()
setupRealTimeTracking()

return {
    sendPing = sendPing,
    sendInstance = sendInstance,
    sendGameTree = sendGameTree,
    sendIncrementalUpdate = sendIncrementalUpdate,
    scanGameTree = scanGameTree
}